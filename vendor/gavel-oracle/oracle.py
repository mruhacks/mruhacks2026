"""
Runs the vendored Gavel (../gavel) as a reference implementation.

src/tests/gavel-differential.test.ts runs this in Docker (see Dockerfile) and talks
to it over stdin/stdout, one JSON object per line each way. It drives the real
Gavel Flask app — its routes, models and `crowd_bt` — through Flask's test
client, against a throwaway SQLite database, so the TypeScript port can be
compared step by step with the original.

Only four things are replaced, all from the outside:

- Gavel's randomness (`numpy.random.shuffle`, `random`, `choice` as imported by
  `gavel.controllers.judge`) reads from a stream of floats the test supplies.
  `shuffle` is the same Fisher–Yates as `src/lib/judging/dispatch.ts`, and
  `choice` is "shuffle, take the first", which is how the port picks a first
  project. Both sides consuming one stream identically is what makes their
  dispatch decisions comparable at all.
- The clock (`datetime.utcnow`, which Gavel's busy window reads), so the test
  can move time forward on both sides together.
- `crowd_bt.argmax` treats gains within 1e-12 of each other as tied, keeping
  the first in (shuffled) order, as `GAIN_TIE_TOLERANCE` does in the port.
  Gavel shuffles so that ties break randomly, but a tie that is exact in
  theory (two items mirrored around the previous one's μ) comes out of numpy
  and V8 differing in the last bit, so the plain `max` would compare rounding
  noise rather than the algorithm.
- Asset building is turned off: pages render, stylesheets are never compiled.
"""

import datetime as _datetime
import json
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'gavel'))

_db_dir = tempfile.mkdtemp(prefix='gavel-oracle-')
os.environ.update({
    'IGNORE_CONFIG_FILE': 'true',
    'ADMIN_PASSWORD': 'oracle',
    'SECRET_KEY': 'oracle',
    'DATABASE_URL': 'sqlite:///' + os.path.join(_db_dir, 'gavel.db'),
    'SEND_STATS': 'false',
    'DISABLE_EMAIL': 'true',
    'EMAIL_FROM': 'oracle@example.com',
    'EMAIL_USER': 'oracle',
    'EMAIL_PASSWORD': 'oracle',
})

from gavel import app, assets  # noqa: E402
import gavel.crowd_bt as crowd_bt  # noqa: E402
import gavel.controllers.judge as judge  # noqa: E402
import gavel.models.annotator as annotator_model  # noqa: E402
from gavel.models import db, Annotator, Item, Decision, Setting  # noqa: E402

assets.auto_build = False
assets.url_expire = False
app.config['TESTING'] = True


# ── Injected randomness and clock ──────────────────────────────────────────

class Stream:
    def __init__(self, values):
        self.values = values
        self.consumed = 0

    def next(self):
        if self.consumed >= len(self.values):
            raise RuntimeError('random stream exhausted')
        value = self.values[self.consumed]
        self.consumed += 1
        return value


stream = Stream([])


def _shuffle(items):
    for i in range(len(items) - 1, 0, -1):
        j = int(stream.next() * (i + 1))
        items[i], items[j] = items[j], items[i]


def _choice(items):
    items = list(items)
    _shuffle(items)
    return items[0]


judge.shuffle = _shuffle
judge.random = lambda: stream.next()
judge.choice = _choice

GAIN_TIE_TOLERANCE = 1e-12


def _argmax(f, xs):
    best, best_value = None, float('-inf')
    for x in xs:
        value = f(x)
        if value - best_value > GAIN_TIE_TOLERANCE * abs(value):
            best, best_value = x, value
    return best


crowd_bt.argmax = _argmax

clock = {'now': _datetime.datetime(2026, 1, 1)}


class _FrozenDatetime(_datetime.datetime):
    @classmethod
    def utcnow(cls):
        return clock['now']


judge.datetime = _FrozenDatetime
annotator_model.datetime = _FrozenDatetime


# ── crowd_bt ───────────────────────────────────────────────────────────────

def _float(x):
    return float(x)


CROWD_BT = {
    'update': lambda args: [_float(x) for x in crowd_bt.update(*args)],
    'expected_information_gain': lambda args: _float(crowd_bt.expected_information_gain(*args)),
    'betaln': lambda args: _float(crowd_bt.betaln(*args)),
    'psi': lambda args: _float(crowd_bt.psi(*args)),
}


# ── Judge flow over HTTP ───────────────────────────────────────────────────

judges = []  # one test client per annotator, in creation order
pages = []   # each judge's last parsed screen

HIDDEN = re.compile(r'<input type="hidden" name="([a-z_]+)" value="([^"]*)">')


def _index(client):
    response = client.get('/')
    if response.status_code != 200:
        raise RuntimeError('GET / returned %d' % response.status_code)
    html = response.get_data(as_text=True)
    fields = dict(HIDDEN.findall(html))
    if 'prev_id' in fields:
        page = {'kind': 'compare', 'previous': int(fields['prev_id']) - 1,
                'current': int(fields['next_id']) - 1}
    elif 'item_id' in fields:
        page = {'kind': 'begin', 'current': int(fields['item_id']) - 1}
    elif 'Wait for a little bit' in html:
        page = {'kind': 'waiting'}
    else:
        raise RuntimeError('unrecognized page: %s' % html[:500])
    page['_fields'] = fields
    return page


def _post(client, url, data):
    response = client.post(url, data=data)
    if response.status_code != 302:
        raise RuntimeError('POST %s returned %d' % (url, response.status_code))


def _public(page):
    return {k: v for k, v in page.items() if not k.startswith('_')}


def reset(msg):
    global judges, pages
    stream.values = msg['stream']
    stream.consumed = 0
    clock['now'] = _datetime.datetime(2026, 1, 1)
    with app.app_context():
        db.drop_all()
        db.create_all()
        Setting.set('closed', 'false')
        for i in range(msg['projects']):
            db.session.add(Item('P%d' % i, 'Table %d' % (i + 1), ''))
        annotators = [Annotator('J%d' % j, 'j%d@example.com' % j, '') for j in range(msg['judges'])]
        db.session.add_all(annotators)
        db.session.commit()
        secrets = [a.secret for a in annotators]
    judges = []
    pages = []
    for secret in secrets:
        client = app.test_client()
        client.get('/login/%s/' % secret)
        # Read the welcome message, as every Gavel judge must.
        client.get('/welcome/')
        with client.session_transaction() as session:
            token = session['_csrf_token']
        _post(client, '/welcome/done', {'action': 'Continue', '_csrf_token': token})
        judges.append(client)
        pages.append(None)
    return {}


def view(msg):
    page = _index(judges[msg['judge']])
    pages[msg['judge']] = page
    return _public(page)


def act(msg):
    j = msg['judge']
    client = judges[j]
    page = pages[j]
    fields = page['_fields']
    token = fields['_csrf_token']
    action = msg['action']
    if page['kind'] == 'begin':
        _post(client, '/begin', {
            'action': {'begin': 'Continue', 'skip': 'Skip'}[action],
            'item_id': fields['item_id'],
            '_csrf_token': token,
        })
    elif page['kind'] == 'compare':
        _post(client, '/vote', {
            'action': {'previous': 'Previous', 'current': 'Current', 'skip': 'Skip'}[action],
            'prev_id': fields['prev_id'],
            'next_id': fields['next_id'],
            '_csrf_token': token,
        })
    else:
        raise RuntimeError('nothing to act on while waiting')
    return view(msg)


def advance(msg):
    clock['now'] += _datetime.timedelta(milliseconds=msg['ms'])
    return {}


def state(msg):
    with app.app_context():
        items = Item.query.order_by(Item.id).all()
        annotators = Annotator.query.order_by(Annotator.id).all()
        decisions = Decision.query.order_by(Decision.id).all()
        return {
            'projects': [{'mu': i.mu, 'sigmaSq': i.sigma_sq, 'views': len(i.viewed)} for i in items],
            'judges': [{'alpha': a.alpha, 'beta': a.beta} for a in annotators],
            'votes': [{'judge': d.annotator_id - 1, 'winner': d.winner_id - 1, 'loser': d.loser_id - 1}
                      for d in decisions],
        }


OPS = {
    'reset': reset,
    'view': view,
    'act': act,
    'advance': advance,
    'state': state,
    'ping': lambda msg: {},
    'crowd_bt': lambda msg: [CROWD_BT[msg['fn']](args) for args in msg['calls']],
}


def main():
    for line in sys.stdin:
        msg = json.loads(line)
        try:
            result = OPS[msg['op']](msg)
            reply = {'ok': True, 'result': result, 'consumed': stream.consumed}
        except Exception as error:  # reported to the test, which fails loudly
            reply = {'ok': False, 'error': '%s: %s' % (type(error).__name__, error)}
        sys.stdout.write(json.dumps(reply) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()

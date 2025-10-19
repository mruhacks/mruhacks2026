-- === GENDERS ===
INSERT INTO genders (label)
VALUES
  ('Male'),
  ('Female'),
  ('Non-binary'),
  ('Other'),
  ('Prefer not to say');

-- === UNIVERSITIES ===
INSERT INTO universities (label)
VALUES
  ('Mount Royal University'),
  ('University of Calgary'),
  ('University of Alberta'),
  ('University of Lethbridge'),
  ('MacEwan University'),
  ('SAIT'),
  ('NAIT'),
  ('Other / Not Listed');

-- === MAJORS ===
INSERT INTO majors (label)
VALUES
  ('Computer Science'),
  ('Software Engineering'),
  ('Information Systems'),
  ('Data Science'),
  ('Cybersecurity'),
  ('Computer Engineering'),
  ('UX / UI Design'),
  ('Game Development'),
  ('Other / Custom');

-- === YEARS OF STUDY ===
INSERT INTO years_of_study (label)
VALUES
  ('1st'),
  ('2nd'),
  ('3rd'),
  ('4th'),
  ('4th+');

-- === INTERESTS ===
INSERT INTO interests (label)
VALUES
  ('Mobile App Development'),
  ('Web Development'),
  ('Data Science and ML'),
  ('UX / UI Design'),
  ('Game Development');

-- === DIETARY RESTRICTIONS ===
INSERT INTO dietary_restrictions (label)
VALUES
  ('Vegetarian'),
  ('Vegan'),
  ('Halal'),
  ('Kosher'),
  ('Gluten-free'),
  ('Peanuts / Tree-nuts allergy'),
  ('Other');

-- === HEARD FROM SOURCES ===
INSERT INTO heard_from_sources (label)
VALUES
  ('Poster'),
  ('Friend / Classmate'),
  ('Social Media'),
  ('Professor / Course Announcement'),
  ('Other');

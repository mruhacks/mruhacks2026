import { Style, Avatar } from '@dicebear/core';
import definition from '@dicebear/styles/shapes.json';

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);

		const seed = url.searchParams.get('seed') ?? 'MRUHACKS';

		const style = new Style(definition);
		const avatar = new Avatar(style, {
			backgroundColor: ['ffe3ea', 'e3edff', 'e2f5e9', 'fdf1d4', 'efe6ff'],
			seed,
		});
		const svg = avatar.toString();
		return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
	},
} satisfies ExportedHandler<Env>;

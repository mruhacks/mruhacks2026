import { Style, Avatar } from '@dicebear/core';
import definition from '@dicebear/styles/shapes.json';

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);

		const seed = url.searchParams.get('seed') ?? 'MRUHACKS';

		const style = new Style(definition);
		const avatar = new Avatar(style, {
			backgroundColor: ['#FADF4B', '#F07B31', '#EC624D', '#D841A1', '#6943EC', '#4D75EE', '#93FFFF'],
			seed,
		});
		const svg = avatar.toString();
		return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
	},
} satisfies ExportedHandler<Env>;

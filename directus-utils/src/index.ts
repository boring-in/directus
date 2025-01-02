type HookExtensionContext = {
	embed: (location: 'head' | 'body', code: string | (() => string)) => void;
};

export default ({ embed }: HookExtensionContext) => {
	embed(
		'head',
		`<script>
			console.log('Hello from Directus Utils Extension!');
			console.log('Current timestamp:', new Date().toISOString());
		</script>`
	);
};

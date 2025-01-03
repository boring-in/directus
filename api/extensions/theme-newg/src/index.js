import { defineTheme } from '@directus/extensions-sdk';

import './main.css';

export default defineTheme({
	id: 'theme-newgen',
	name: 'The New Gen',
	appearance: 'light',
	rules: {
		background: '#fff',
		foreground: '#333',

		navigation: {
			modules: {
				background: 'green',
			},
		},
	},
});

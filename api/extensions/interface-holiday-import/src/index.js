import InterfaceComponent from './interface.vue';

export default {
	id: 'LawRee',
	name: '$t:content',
	icon: 'box',
	description: 'Button for importing holidays',
	component: InterfaceComponent,
	options: [{
		field: 'notice',
		name: 'notice',
		meta:{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'notice translation'
			}
		}
	},
		{
			field: 'buttonLabel',
			name: 'Button label',
			meta: {
				interface: 'system-input-translated-string',
				width: 'full',
				options: {
					placeholder: 'button label translation'
				}
			}
		},
		{
			field: 'yearInputPlaceholder',
			name: 'Year input',
			meta: {
				interface: 'system-input-translated-string',
				width: 'full',
				options: {
					placeholder: 'year input translation'
				}
			}
		},
		{
			field: 'importFieldsLabel',
			name: 'Holiday input label',
			meta: {
				interface: 'system-input-translated-string',
				width: 'full',
				options: {
					placeholder: 'Holiday fields label translation'
				}
			}
		},
	],
	types: ['string'],
};

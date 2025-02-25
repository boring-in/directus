import InterfaceComponent from './interface.vue';

export default {
	id: 'endpoint-button',
	name: 'Endpoint calling button',
	icon: 'box',
	description: 'This button will call an endpoint',
	component: InterfaceComponent,
	options: [{
		field : 'endpoint',
		name : 'Endpoint',
		meta :{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'Enter endpoint here'
			}
		}
	},
	{
		field : 'params',
		name : 'Endpoint parameters',
		meta :{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'Param1/param2/param3..'
			}
		}
	},
	{
		field:'auth',
		name:'Authorization Token',
		meta:{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'Enter authorization token here'
			}
		}
	},
	{
		field:'buttonLabel',
		name:'Button label',
		meta:{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'Enter button lable here'
			}
		}
	},
	{
		field:'redirect',
		name:'Redirect',
		meta:{
			interface:'boolean',
			width:'full',
			options:{
				default: 'false'
			}
		}
	},
	{
		field:'redirectWithData',
		name:'Redirect with data',
		meta:{
			interface:'boolean',
			width:'full',
			options:{
				default: 'false'
			}
		}

	},
	{
		field:'redirectUrl',
		name:'Redirect URL',
		meta:{
			interface:'system-input-translated-string',
			width:'full',
			options:{
				placeholder: 'Enter redirect url here'
			}
	}
}
	
	],
	types: ['string'],
};

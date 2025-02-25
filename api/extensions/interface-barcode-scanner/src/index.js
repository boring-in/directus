import InterfaceComponent from './interface.vue';

export default {
	id: 'Barcode Scanner ',
	name: 'Barcode Scanner interface',
	icon: 'box',
	description: 'Barcode scanning interface',
	component: InterfaceComponent,
	options:[
			{
				field:'show_onhand',
				name:'Show Onhand',
				type:'boolean',
				meta:{
					width:'half',
					interface:'toggle',
					default: false
				}
			},
			{
				field:'show_reserved',
				name:'Show Reserved',
				type:'boolean',
				meta:{
					width:'half',
					interface:'toggle',
					default: false
				}
			},
			{
				field:'show_ordered',
				name:'Show Ordered',
				type:'boolean',
				meta:{
					width:'half',
					interface:'toggle',
					default: false
				}
			},
			{
				field:'show_available',
				name:'Show Available',
				type:'boolean',
				meta:{
					width:'half',
					interface:'toggle',
					default: false
				}
			},
			{
				field:'price',
				name:'price',
				type:'boolean',
				meta:{
					width:'half',
					interface:'toggle',
				}
			},
			{
				field:'mode',
				name:'mode',
				type:'string',
				
				meta:{
					width:"full",
					interface:"select-dropdown",
					options:{
						choices:[{
							value:'receiving',
							text:'receiving products'
						},
						{
							value:'write-off',
							text:'stock write-off'
						},
						{
							value:'taking',
							text:'stock taking'
						},
						{
							value:"purchase",
							text:"purchase"
						},
						{
							value:"transfer",
							text:"transfer"
						}
						]
					}
				}

			}],
	types: ['json'],
};

import InterfaceComponent from './interface.vue';

export default {
	id: 'json-format-interface',
	name: 'StockApp Json Format Interface',
	icon: 'box',
	description: 'Formats JSON or json-like string to a readable format',
	component: InterfaceComponent,
	options: [
		{
			field:"format",
			name:"Format HTML",
			type:"string",
			description:"HTML to format the JSON"
		},
		{
			field : "recursive",
			name : "Recursive",
			type : "boolean",
			description : "use the HTML format for each element in the JSON",
		},
		{
			field : "wrapperClass",
			name : "class",
			type : "string",
			description : "html class for recursive display",
		},
		{
			field : "innerClass",
			name : "Inner Class",
			type : "string",
			description : "inner html recursvie class",
		}
		

	]

	,
	types: ['json','string'],
};

export default {
	id: 'stock-history',
	handler: async({ text },{services,database}) => {
		console.log("start")
		//console.log(database)
		
		let test = await database.context.raw('SELECT * FROM `stock_history`');
		console.log(test)
		
	},
};

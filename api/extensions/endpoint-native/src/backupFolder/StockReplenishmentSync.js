import mysql from 'mysql';

import Constants from "../../const/Constants";
import ExternalDataProvider from '../../class/ExternalDataProvider';
import Product from '../../class/Product';
import util from 'util';
class StockReplenishmentSync {
    _context;
    constructor(context) {
       this._context=context;
       this._getSchema = this._context.getSchema;
    }

    async stockSync(warehouse,productId,productAttributeId,quantity){
        let { ItemsService } = this._context.services;
        let schema = await this._getSchema();
        let warehouseMap = new Map();
		warehouseMap.set(5, 1);
		warehouseMap.set(6, 2);
		warehouseMap.set(7, 3);
		//let warehouse = warehouseMap.get(req.params.warehouse);
		let logService = new ItemsService("replenishment_log",{schema:schema});
		let salesChannelProductId = productAttributeId == 0 ? productId: productId + "_" + productAttributeId;
		let salesChannelProductService = new ItemsService("sales_channel_products",{schema:schema});
		let salesChannelProductData = await salesChannelProductService.readByQuery({filter:{sales_channel_product_id:{_eq:salesChannelProductId}}});
		let product = salesChannelProductData[0].product;
		// let quantity = parseInt(quantity);

		let stockService = new ItemsService("stock",{schema:schema});
		let stockData = await stockService.readByQuery({filter:{product:{_eq:product},warehouse:{_eq:warehouse}}});
		let stock = stockData[0].id;
		let onhand = stockData[0].onhand_quantity;
		onhand = onhand + quantity;
		await stockService.updateOne(stock,{onhand_quantity:onhand});
		let note = "Stock replenished by " + quantity + " units in warehouse " + warehouse + " for product " + product;
		await logService.createOne({message:note});
		
    }
	async  fetchAndDisplayReplenishments(con) {
		console.log("Fetching replenishments");
	
		// Convert con.query to a function that returns a promise
		let query = util.promisify(con.query).bind(con);
	
		try {
			// Fetch all records from cos_advanced_supply
			let replenishments = await query('SELECT * FROM cos_advanced_supply limit 10');
	
			console.log("Replenishments data:");
			console.log(replenishments);
			
			console.log(`Total replenishments fetched: ${replenishments.length}`);
		} catch (error) {
			console.error('Error fetching replenishments:', error);
		}
	}

	async replenishmentSync(req, res) {
		let con;
		
			con =  mysql.createConnection({
				host: Constants.psHost,
				port: Constants.psPort,
				user: Constants.psUser,
				password: Constants.psPassword,
				database: Constants.psDatabase
			});
			
			 let query = util.promisify(con.query).bind(con);
			 let  schema = await this._getSchema();
			 let{ ItemsService }= this._context.services;
			 let  stockReplenishmentService = new ItemsService("stock_replenishment", { schema });
			
			let replenishmentExterenalId = await this.findLastCommonReplenihment(con,stockReplenishmentService);
			if(replenishmentExterenalId != null) {
			await this.processNewReplenishments(con, replenishmentExterenalId);
			}
		
	
			con.end();
		
			
		
	}

	async findLastCommonReplenihment(con, stockReplenishmentService) {
		let replenishmentsLocal = await stockReplenishmentService.readByQuery({fields:["invoice","date_add","invoice_date"],sort:['-id'],limit:100});
		console.log("replenishmentsLocal")
		console.log(replenishmentsLocal)
		let counter = 0;
		let found = false;
		let query = util.promisify(con.query).bind(con);
		let replenishment = null;
		while (!found && counter < replenishmentsLocal.length) {
			console.log("counter")
			console.log(counter)
			let replenishmentLocal = replenishmentsLocal[counter];
			let queryString = `SELECT * FROM cos_advanced_supply WHERE invoice_number = ? AND invoice_date = ?`;
			if(replenishmentLocal.invoice && replenishmentLocal.invoice_date) {
				let replenishmentsExternal =await query(queryString,[replenishmentLocal.invoice,replenishmentLocal.invoice_date]);
				console.log("replenishmentsExternal")
				console.log(replenishmentsExternal)
				if(replenishmentsExternal.length > 0) {
					found = true;
					replenishment = replenishmentsExternal[0].id_advanced_supply;

				}
			
			}
			counter++;
		}
		return replenishment;
	
}
	
	async processNewReplenishments(con, lastKnownReplenishment) {
		console.log(lastKnownReplenishment);
		 console.log("Processing new replenishments");
		let query = util.promisify(con.query).bind(con);

					// Second query to get new replenishments
				let newReplenishments =	await query(
						'SELECT id_advanced_supply, invoice_number, invoice_date, date_add, id_warehouse, supplier_name FROM cos_advanced_supply WHERE id_advanced_supply > ?',
						[lastKnownReplenishment])
					
	
							 console.log(`Found ${newReplenishments.length} new replenishments`);
	
							try {
								for (let replenishmentData of newReplenishments) {
									await this.createReplenishment(replenishmentData, con);
								}
								
							} catch (error) {
								console.error('Error creating replenishments:', error);
								
							}
						
					
	}
		
	
	async processReplenishmentsFromYesterday(con) {
		 console.log("replenishments from yesterday")
		let yesterdayDate = this.getYesterdayDate();
		return new Promise((resolve, reject) => {
			con.query(
				'SELECT id_advanced_supply, invoice_number, invoice_date, date_add, id_warehouse, supplier_name FROM cos_advanced_supply WHERE date_add > ?',
				[yesterdayDate],
				async (error, results, fields) => {
					if (error) {
						console.error('Error executing query:', error);
						reject(error);
						return;
					}
	
					 console.log('Query results:', results);
	
					if (Array.isArray(results) && results.length > 0) {
						for (let replenishmentData of results) {
							console.log("replenishment data")
							console.log(replenishmentData)
							await this.createReplenishment(replenishmentData, con);
						}
						// console.log(`Processed ${results.length} replenishments`);
					} else {
						// console.log('No replenishments found for yesterday');
					}
	
					resolve();
				}
			);
		});
	}
	
	getYesterdayDate() {
		let  today = new Date();
		let  yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		return yesterday.toISOString().split('T')[0]; // Returns date in 'YYYY-MM-DD' format
	}

	async createReplenishment(replenishmentData,  con) {
		// console.log("stock_replenishment : create replenishment");
		let {ItemsService} = this._context.services;
		let schema = await this._getSchema();
		let stockReplenishmentService = new ItemsService("stock_replenishment", {schema: schema});
		let stockReplenishmentProductsService = new ItemsService("stock_replenishment_products", {schema: schema});
		let salesChannelProductService = new ItemsService("sales_channel_products", {schema: schema});
		let supplierService = new ItemsService("supplier", {schema: schema});
		let stockService = new ItemsService("stock", {schema: schema});
		let warehouseService = new ItemsService("warehouse", {schema: schema});
		let currencyService = new ItemsService("currency", {schema: schema});
		let orderImportErrorService = new ItemsService("order_import_error_log", {schema: schema});
		let dbReplenishmentId = replenishmentData.id_advanced_supply;
		let replenishmentLogService = new ItemsService("replenishment_log", {schema: schema});
		let warehouseExternalId = replenishmentData.id_warehouse;
		let appWarehouseId  = 0;
	
		switch(warehouseExternalId) {
			case 5: appWarehouseId = 1; break;
			case 6: appWarehouseId = 2; break;
			case 7: appWarehouseId = 3; break;
			default: appWarehouseId = 3; break;
		}
	
		
	
		// check supplier
		let appSupplierData = await supplierService.readByQuery({filter:{supplier_name:{_eq:replenishmentData.supplier_name}}}, {fields:["supplier_id"]});
		let appSupplierId;
	
		if(appSupplierData.length == 0) {
			// get suppliers data 
			try {
				const dbSupplierData = await new Promise((resolve, reject) => {
					con.query(`SELECT cs.id_supplier, cs.name, cc.iso_code, cc.sign FROM cos_supplier cs 
						left join cos_currency cc ON cs.id_currency = cc.id_currency WHERE cs.name = ?`,
						[replenishmentData.supplier_name],
						(error, results) => {
							if (error) reject(error);
							else resolve(results);
						}
					);
				});
	
				//get app currency 
				let appCurrencyData = await currencyService.readByQuery({filter:{code:{_eq:dbSupplierData[0].iso_code}}});
				let appCurrencyId;
				if(appCurrencyData.length == 0) {
					appCurrencyId = await currencyService.createOne({code:dbSupplierData[0].iso_code, symbol:dbSupplierData[0].sign});
				} else {
					appCurrencyId = appCurrencyData[0].id;
				}
				appSupplierId = await supplierService.createOne({supplier_name:replenishmentData.supplier_name, currency:appCurrencyId});
			} catch (error) {
				await replenishmentLogService.createOne({message: error.message});
				throw error;
			}
		} else {
			appSupplierId = appSupplierData[0].supplier_id;
			// console.log("stock_replenishment : supplier exists : " + appSupplierId);
		}
	
		try {
			let appReplenishment = await stockReplenishmentService.createOne({
				warehouse: appWarehouseId,
				supplier: appSupplierId,
				invoice: replenishmentData.invoice_number,
				invoice_date: replenishmentData.invoice_date,
				date_add: replenishmentData.date_add
			});
	
			//get arrived products
			// console.log(replenishmentData.id_advanced_supply);
			const arrivedProducts = await new Promise((resolve, reject) => {
				con.query(`SELECT id_product, product_name, id_product_attribute, quantity, price, date_add 
					FROM cos_advanced_supply_detail 
					WHERE id_advanced_supply = ? and deleted = 0`,
					[replenishmentData.id_advanced_supply],
					(error, results) => {
						if (error) reject(error);
						else resolve(results);
					}
				);
			});
	
			// console.log("stock_replenishment : arrived products");
			// console.log(arrivedProducts);
	
			for(let i = 0; i < arrivedProducts.length; i++) {
				let appExternalId = arrivedProducts[i].id_product_attribute == 0 
					? arrivedProducts[i].id_product 
					: arrivedProducts[i].id_product + "_" + arrivedProducts[i].id_product_attribute;
	
				let appProductData = await salesChannelProductService.readByQuery(
					{filter:{sales_channel_product_id:{_eq:appExternalId}}},
					{fields:["product"]}
				);
	
				// console.log("stock_replenishment : product data");
				// console.log(appProductData);
	
				if(appProductData.length == 0) {
					let externalDataProvider = new ExternalDataProvider(Constants.psHost, Constants.psPort,  Constants.psPassword, Constants.psUser, Constants.psDatabase);
					let productDataExternal = await externalDataProvider.getPrestashopProduct(arrivedProducts[i].id_product, arrivedProducts[i].id_product_attribute);
					let productDataResponse = productDataExternal[0];
					let productHelper = new Product(ItemsService, schema);
					let productData = await productHelper.getProductBySku(productDataResponse);
					appProductData.push({product: productData.product_id});
					console.log(appProductData)
					await stockReplenishmentProductsService.createOne({
						product: productData.product_id,
						quantity: arrivedProducts[i].quantity,
						unit_price: arrivedProducts[i].price,
						arrival_date: arrivedProducts[i].date_add,
						stock_replenishment: appReplenishment
					});
				} else {
					await stockReplenishmentProductsService.createOne({
						product: appProductData[0].product,
						quantity: arrivedProducts[i].quantity,
						unit_price: arrivedProducts[i].price,
						arrival_date: arrivedProducts[i].date_add,
						stock_replenishment: appReplenishment
					});
				}
				//update stock
				let stockData = await stockService.readByQuery({filter:{product:{_eq:appProductData[0].product},warehouse:{_eq:appWarehouseId}}});
				if(stockData.length == 0) {
					await stockService.createOne({
						product: appProductData[0].product,
						warehouse: appWarehouseId,
						onhand_quantity: arrivedProducts[i].quantity
					});
				} else {
					let onhand = stockData[0].onhand_quantity + arrivedProducts[i].quantity;
					await stockService.updateOne(stockData[0].id, {onhand_quantity:onhand});
				}
			}
		} catch (error) {
			await replenishmentLogService.createOne({message: error.message});
			throw error;
		}
	}
	
		
	

}export default StockReplenishmentSync;




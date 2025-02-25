import mysql from 'mysql';
import Constants from "../../const/Constants";
import ExternalDataProvider from '../../class/ExternalDataProvider';
import Product from '../../class/Product';
import util from 'util';

interface Context {
    services: {
        ItemsService: any;
    };
    getSchema: () => Promise<any>;
}

interface ReplenishmentData {
    id_advanced_supply: number;
    invoice_number: string;
    invoice_date: string;
    date_add: string;
    id_warehouse: number;
    supplier_name: string;
}

interface ArrivedProduct {
    id_product: number;
    product_name: string;
    id_product_attribute: number;
    quantity: number;
    price: number;
    date_add: string;
}

class StockReplenishmentSync {
    private _context: Context;
    private _getSchema: () => Promise<any>;

    constructor(context: Context) {
        this._context = context;
        this._getSchema = this._context.getSchema;
    }

    /**
     * Synchronizes stock for a specific product in a warehouse
     * @param warehouse - Warehouse identifier
     * @param productId - Product identifier
     * @param productAttributeId - Product attribute identifier
     * @param quantity - Quantity to sync
     */
    async stockSync(
        warehouse: number,
        productId: number,
        productAttributeId: number,
        quantity: number
    ): Promise<void> {
        const { ItemsService } = this._context.services;
        const schema = await this._getSchema();
        const warehouseMap = new Map<number, number>();
        warehouseMap.set(5, 1);
        warehouseMap.set(6, 2);
        warehouseMap.set(7, 3);

        const logService = new ItemsService("replenishment_log", { schema });
        const salesChannelProductId = productAttributeId === 0 ? productId.toString() : `${productId}_${productAttributeId}`;
        const salesChannelProductService = new ItemsService("sales_channel_products", { schema });
        const salesChannelProductData = await salesChannelProductService.readByQuery({
            filter: { sales_channel_product_id: { _eq: salesChannelProductId } }
        });
        const product = salesChannelProductData[0].product;

        const stockService = new ItemsService("stock", { schema });
        const stockData = await stockService.readByQuery({
            filter: { product: { _eq: product }, warehouse: { _eq: warehouse } }
        });
        const stock = stockData[0].id;
        let onhand = stockData[0].onhand_quantity;
        onhand = onhand + quantity;
        await stockService.updateOne(stock, { onhand_quantity: onhand });
        const note = `Stock replenished by ${quantity} units in warehouse ${warehouse} for product ${product}`;
        await logService.createOne({ message: note });
    }

    /**
     * Fetches and displays replenishments from the database
     * @param con - MySQL connection
     */
    async fetchAndDisplayReplenishments(con: mysql.Connection): Promise<void> {
        console.log("Fetching replenishments");

        const query = util.promisify(con.query).bind(con);

        try {
            const replenishments = await query('SELECT * FROM cos_advanced_supply limit 10');
            console.log("Replenishments data:");
            console.log(replenishments);
            console.log(`Total replenishments fetched: ${replenishments.length}`);
        } catch (error) {
            console.error('Error fetching replenishments:', error);
        }
    }

    /**
     * Synchronizes replenishment data
     */
    async replenishmentSync(req: any, res: any): Promise<void> {
        let con: mysql.Connection;

        con = mysql.createConnection({
            host: Constants.psHost,
            port: Constants.psPort,
            user: Constants.psUser,
            password: Constants.psPassword,
            database: Constants.psDatabase
        });

        const schema = await this._getSchema();
        const { ItemsService } = this._context.services;
        const stockReplenishmentService = new ItemsService("stock_replenishment", { schema });

        const replenishmentExterenalId = await this.findLastCommonReplenihment(con, stockReplenishmentService);
        if (replenishmentExterenalId != null) {
            await this.processNewReplenishments(con, replenishmentExterenalId);
        }

        con.end();
    }

    /**
     * Finds the last common replenishment between local and external systems
     */
    async findLastCommonReplenihment(con: mysql.Connection, stockReplenishmentService: any): Promise<number | null> {
        const replenishmentsLocal = await stockReplenishmentService.readByQuery({
            fields: ["invoice", "date_add", "invoice_date"],
            sort: ['-id'],
            limit: 100
        });
        console.log("replenishmentsLocal");
        console.log(replenishmentsLocal);

        let counter = 0;
        let found = false;
        const query = util.promisify(con.query).bind(con);
        let replenishment: number | null = null;

        while (!found && counter < replenishmentsLocal.length) {
            console.log("counter");
            console.log(counter);
            const replenishmentLocal = replenishmentsLocal[counter];
            const queryString = `SELECT * FROM cos_advanced_supply WHERE invoice_number = ? AND invoice_date = ?`;

            if (replenishmentLocal.invoice && replenishmentLocal.invoice_date) {
                const replenishmentsExternal = await query(queryString, [
                    replenishmentLocal.invoice,
                    replenishmentLocal.invoice_date
                ]);
                console.log("replenishmentsExternal");
                console.log(replenishmentsExternal);

                if (replenishmentsExternal.length > 0) {
                    found = true;
                    replenishment = replenishmentsExternal[0].id_advanced_supply;
                }
            }
            counter++;
        }
        return replenishment;
    }

    /**
     * Processes new replenishments since the last known one
     */
    async processNewReplenishments(con: mysql.Connection, lastKnownReplenishment: number): Promise<void> {
        console.log(lastKnownReplenishment);
        console.log("Processing new replenishments");
        const query = util.promisify(con.query).bind(con);

        const newReplenishments = await query(
            'SELECT id_advanced_supply, invoice_number, invoice_date, date_add, id_warehouse, supplier_name FROM cos_advanced_supply WHERE id_advanced_supply > ?',
            [lastKnownReplenishment]
        );

        console.log(`Found ${newReplenishments.length} new replenishments`);

        try {
            for (const replenishmentData of newReplenishments) {
                await this.createReplenishment(replenishmentData, con);
            }
        } catch (error) {
            console.error('Error creating replenishments:', error);
        }
    }

    /**
     * Processes replenishments from yesterday
     */
    async processReplenishmentsFromYesterday(con: mysql.Connection): Promise<void> {
        console.log("replenishments from yesterday");
        const yesterdayDate = this.getYesterdayDate();
        return new Promise((resolve, reject) => {
            con.query(
                'SELECT id_advanced_supply, invoice_number, invoice_date, date_add, id_warehouse, supplier_name FROM cos_advanced_supply WHERE date_add > ?',
                [yesterdayDate],
                async (error, results: ReplenishmentData[], fields) => {
                    if (error) {
                        console.error('Error executing query:', error);
                        reject(error);
                        return;
                    }

                    console.log('Query results:', results);

                    if (Array.isArray(results) && results.length > 0) {
                        for (const replenishmentData of results) {
                            console.log("replenishment data");
                            console.log(replenishmentData);
                            await this.createReplenishment(replenishmentData, con);
                        }
                    }

                    resolve();
                }
            );
        });
    }

    /**
     * Gets yesterday's date in YYYY-MM-DD format
     */
    private getYesterdayDate(): string {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }

    /**
     * Creates a new replenishment record
     */
    async createReplenishment(replenishmentData: ReplenishmentData, con: mysql.Connection): Promise<void> {
        const { ItemsService } = this._context.services;
        const schema = await this._getSchema();
        const stockReplenishmentService = new ItemsService("stock_replenishment", { schema });
        const stockReplenishmentProductsService = new ItemsService("stock_replenishment_products", { schema });
        const salesChannelProductService = new ItemsService("sales_channel_products", { schema });
        const supplierService = new ItemsService("supplier", { schema });
        const stockService = new ItemsService("stock", { schema });
    
        const currencyService = new ItemsService("currency", { schema });

        const replenishmentLogService = new ItemsService("replenishment_log", { schema });
        const warehouseExternalId = replenishmentData.id_warehouse;
        let appWarehouseId = 0;

        switch (warehouseExternalId) {
            case 5: appWarehouseId = 1; break;
            case 6: appWarehouseId = 2; break;
            case 7: appWarehouseId = 3; break;
            default: appWarehouseId = 3; break;
        }

        // check supplier
        const appSupplierData = await supplierService.readByQuery(
            { filter: { supplier_name: { _eq: replenishmentData.supplier_name } } },
            { fields: ["supplier_id"] }
        );
        let appSupplierId: number;

        if (appSupplierData.length === 0) {
            try {
                const dbSupplierData = await new Promise<any[]>((resolve, reject) => {
                    con.query(
                        `SELECT cs.id_supplier, cs.name, cc.iso_code, cc.sign FROM cos_supplier cs 
                        left join cos_currency cc ON cs.id_currency = cc.id_currency WHERE cs.name = ?`,
                        [replenishmentData.supplier_name],
                        (error, results) => {
                            if (error) reject(error);
                            else resolve(results);
                        }
                    );
                });

                const appCurrencyData = await currencyService.readByQuery({ filter: { code: { _eq: dbSupplierData[0].iso_code } } });
                let appCurrencyId: number;

                if (appCurrencyData.length === 0) {
                    appCurrencyId = await currencyService.createOne({
                        code: dbSupplierData[0].iso_code,
                        symbol: dbSupplierData[0].sign
                    });
                } else {
                    appCurrencyId = appCurrencyData[0].id;
                }

                appSupplierId = await supplierService.createOne({
                    supplier_name: replenishmentData.supplier_name,
                    currency: appCurrencyId,
                    delivery_days:0
                });
            } catch (error: any) {
                await replenishmentLogService.createOne({ message: error.message });
                throw error;
            }
        } else {
            appSupplierId = appSupplierData[0].supplier_id;
        }

        try {
            const appReplenishment = await stockReplenishmentService.createOne({
                warehouse: appWarehouseId,
                supplier: appSupplierId,
                invoice: replenishmentData.invoice_number,
                invoice_date: replenishmentData.invoice_date,
                date_add: replenishmentData.date_add
            });

            const arrivedProducts = await new Promise<ArrivedProduct[]>((resolve, reject) => {
                con.query(
                    `SELECT id_product, product_name, id_product_attribute, quantity, price, date_add 
                    FROM cos_advanced_supply_detail 
                    WHERE id_advanced_supply = ? and deleted = 0`,
                    [replenishmentData.id_advanced_supply],
                    (error, results) => {
                        if (error) reject(error);
                        else resolve(results);
                    }
                );
            });

            for (const arrivedProduct of arrivedProducts) {
                const appExternalId = arrivedProduct.id_product_attribute === 0
                    ? arrivedProduct.id_product.toString()
                    : `${arrivedProduct.id_product}_${arrivedProduct.id_product_attribute}`;

                const appProductData = await salesChannelProductService.readByQuery(
                    { filter: { sales_channel_product_id: { _eq: appExternalId } } },
                    { fields: ["product"] }
                );

                if (appProductData.length === 0) {
                    const externalDataProvider = new ExternalDataProvider(
                        Constants.psHost,
                        Constants.psPort,
                        Constants.psPassword,
                        Constants.psUser,
                        Constants.psDatabase
                    );
                    const productDataExternal = await externalDataProvider.getPrestashopProduct(
                        arrivedProduct.id_product,
                        arrivedProduct.id_product_attribute
                    );
                    const productDataResponse = productDataExternal[0];
                    const productHelper = new Product(ItemsService, schema);
                    const productData = await productHelper.getProductBySku(productDataResponse);
                    appProductData.push({ product: productData.product_id });
                    console.log(appProductData);
                    await stockReplenishmentProductsService.createOne({
                        product: productData.product_id,
                        quantity: arrivedProduct.quantity,
                        unit_price: arrivedProduct.price,
                        arrival_date: arrivedProduct.date_add,
                        stock_replenishment: appReplenishment
                    });
                } else {
                    await stockReplenishmentProductsService.createOne({
                        product: appProductData[0].product,
                        quantity: arrivedProduct.quantity,
                        unit_price: arrivedProduct.price,
                        arrival_date: arrivedProduct.date_add,
                        stock_replenishment: appReplenishment
                    });
                }

                // update stock
                const stockData = await stockService.readByQuery({
                    filter: {
                        product: { _eq: appProductData[0].product },
                        warehouse: { _eq: appWarehouseId }
                    }
                });

                if (stockData.length === 0) {
                    await stockService.createOne({
                        product: appProductData[0].product,
                        warehouse: appWarehouseId,
                        onhand_quantity: arrivedProduct.quantity
                    });
                } else {
                    const onhand = stockData[0].onhand_quantity + arrivedProduct.quantity;
                    await stockService.updateOne(stockData[0].id, { onhand_quantity: onhand });
                }
            }
        } catch (error: any) {
            await replenishmentLogService.createOne({ message: error.message });
            throw error;
        }
    }
}

export default StockReplenishmentSync;

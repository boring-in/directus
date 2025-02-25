export class PrestashopStockManager {
    context;
    getSchema;
    services;
    ItemsService;

    constructor(context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
    }

    async createStock(productId, warehouse) {
        let schema = await this.getSchema();
        let stockService = new this.ItemsService("stock", {schema});
        let stock = await stockService.createOne({
            product: productId,
            warehouse: warehouse,
            onhand_quantity: 100
        });
        return stock;
    }

    async checkStock(productId, warehouse) {
        let schema = await this.getSchema();
        let stockService = new this.ItemsService("stock", {schema});
        
        let productStock = await stockService.readByQuery({
            filter: {
                _and: [
                    {warehouse: {_eq: warehouse}},
                    {product: {_eq: productId}}
                ]
            }
        });

        if (productStock.length === 0) {
            await stockService.createOne({
                product: productId,
                warehouse: warehouse,
                onhand_quantity: 100
            });
        }
    }
}

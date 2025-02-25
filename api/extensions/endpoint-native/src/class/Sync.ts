import WoocommerceSync from "./WoocommerceSync/index";

export class Sync{
    
    private ItemsService: any;
    private schema: any;
    private salesChannelService: any;
    constructor(ItemsService: any, schema: any){
        this.ItemsService = ItemsService;
        this.schema = schema;
        this.salesChannelService = new ItemsService("sales_channel", { schema: schema });
       
    }
    /**
     * Function for product sync ( downstream , sales channel cart engine agnostic)
     * Get information from any salesChannel
     * Check what sales channel
     * relay information to the correct sales channel and its operating class 
     */
    

    async productSync(req: any) {
        let fullUrl = req.headers['x-wc-webhook-source'];
        let regex = /https?:\/\/(.*?)\//;
        let match = fullUrl.match(regex);
        let domain = match ? match[1] : null;
        let salesChannel = await this.salesChannelService.readByQuery({filter:{ domain_name:{_eq: domain }}});
        
        if (!salesChannel) {
            throw new Error('Sales channel is not defined');
        }
        
        if(salesChannel[0].cart_engine === "WC") {
            let woocommerceSync = new WoocommerceSync(this.ItemsService, this.schema, salesChannel[0]);
            await woocommerceSync.syncProductDownstream(req.body.id);
        }
        
        return 200;
    }

    /**
     * Function for stock sync downstream ( sales channel agnostic)
     * get information from sales channel
     * check what sales channel
     * relay information to the correct sales channel and its operating class
     */
    async stockSync(req: any) {
        let fullUrl = req.headers['x-wc-webhook-source'];
        let regex = /https?:\/\/(.*?)\//;
        let match = fullUrl.match(regex);
        let domain = match ? match[1] : null;
        let salesChannel = await this.salesChannelService.readByQuery({filter:{ domain_name:{_eq: domain }}});
        
        if (!salesChannel) {
            throw new Error('Sales channel is not defined');
        }
        
        if(salesChannel[0].cart_engine === "WC") {
            let woocommerceSync = new WoocommerceSync(this.ItemsService, this.schema, salesChannel[0]);
            await woocommerceSync.syncStockDownstream(req.body.id, req.body.product_id);
        }
        
        return 200;
    }

    /**
     * Function for order sync downstream ( sales channel agnostic)
     * function gets post request from outside sales channel
     * 
     */

    async orderSync(req:any){
      //  console.log(req)
        let fullUrl = req.headers['x-wc-webhook-source'];
		let regex = /https?:\/\/(.*?)\//;
		let match = fullUrl.match(regex);
		let domain = match ? match[1] : null;
        console.log(domain)
        console.log(req.body)
        console.log(req.body.id)
		let salesChannel = await this.salesChannelService.readByQuery({filter:{ domain_name:{_eq: domain }}});
        console.log(salesChannel[0])
        if (!salesChannel) {
            throw new Error('Sales channel is not defined');
        }
        if(salesChannel[0].cart_engine==="WC"){
            let woocommerceSync = new WoocommerceSync(this.ItemsService, this.schema, salesChannel[0]);
            woocommerceSync.syncOrder(req.body.id);
        }
        // get order data
        // check what sales channel
        // relay information to the correct sales channel and its operating class
        // return response
       

    }
}

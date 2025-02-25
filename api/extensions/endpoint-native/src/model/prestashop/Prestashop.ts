import { PrestashopOrderManager } from "./PrestashopOrderManager";
import { PrestashopProductManager } from "./PrestashopProductManager";
import { PrestashopAttributeManager } from "./PrestashopAttributeManager";
import { PrestashopStockManager } from "./PrestashopStockManager";
import { PrestashopUtility } from "./PrestashopUtility";
// TODO Total isiraso neatskaicius nuolados sutvarkyti
/**
 * Interface defining the expected structure of the context object
 */
interface PrestashopContext {
    getSchema: any; // TODO: Define specific type when available
    services: {
        ItemsService: any; // TODO: Define specific type when available
    };
}

/**
 * Main Prestashop class that manages interactions with the Prestashop e-commerce platform
 */
class Prestashop {
    private context: PrestashopContext;
    private getSchema: any;
    private services: any;
    private ItemsService: any;
    private orderManager: PrestashopOrderManager;
    private productManager: PrestashopProductManager;
    private attributeManager: PrestashopAttributeManager;
    private stockManager: PrestashopStockManager;
    private utility: PrestashopUtility;

    constructor(context: PrestashopContext) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;

        // Initialize managers
        this.orderManager = new PrestashopOrderManager(context);
        this.productManager = new PrestashopProductManager(context);
        this.attributeManager = new PrestashopAttributeManager(context);
        this.stockManager = new PrestashopStockManager(context);
        this.utility = new PrestashopUtility();
    }

    /**
     * Retrieves orders from Prestashop
     */
    public async getOrders(): Promise<any> {
        return await this.orderManager.getOrders();
    }

    /**
     * Retrieves main order information using order ID
     */
    public async getOrderMainTwo(orderId: number | number): Promise<any> {
        return await this.orderManager.getOrderMainTwo(orderId);
    }

    /**
     * Retrieves main order information using order ID and shop ID
     */
    public async getOrderMain(orderId: number, shopId: number): Promise<any> {
        return await this.orderManager.getOrderMain(orderId, shopId);
    }

    /**
     * Retrieves product information from Prestashop
     */
    public async getProduct(
        productExternalId: string,
        salesChannelId: number,
        salesChannelDomain: string,
        consumerKey: string,
        defaultWarehouse: string,
        taxRate: number,
        productAttributeId: string 
    ): Promise<any> {
        return await this.productManager.getProduct(
            productExternalId,
            salesChannelId,
            salesChannelDomain,
            consumerKey,
            defaultWarehouse,
            taxRate,
            productAttributeId
        );
    }

    /**
     * Checks if an attribute exists
     */
    public async checkAttribute(attributeName: string): Promise<any> {
        return await this.attributeManager.checkAttribute(attributeName);
    }

    /**
     * Checks if an attribute value exists
     */
    public async checkAttributeValue(attribute: any, value: string): Promise<any> {
        return await this.attributeManager.checkAttributeValue(attribute, value);
    }

    /**
     * Retrieves combinations for a product
     */
    public async getCombinations(
        salesChannelDomain: string,
        consumerKey: string,
        productAttributeId: string
    ): Promise<any> {
        return await this.attributeManager.getCombinations(salesChannelDomain, consumerKey, productAttributeId);
    }

    /**
     * Updates product attributes
     */
    public async updateProductAttributes(
        product: any,
        salesChannelDomain: string,
        consumerKey: string,
        salesChannelProduct: any
    ): Promise<any> {
        return await this.attributeManager.updateProductAttributes(product, salesChannelDomain, consumerKey, salesChannelProduct);
    }

    /**
     * Retrieves attributes in JSON format
     */
    public async getAttributesJson(appProductId: string | number, productService: any): Promise<any> {
        return await this.attributeManager.getAttributesJson(appProductId, productService);
    }

    /**
     * Creates stock entry for a product
     */
    public async createStock(productId: string | number, warehouse: any): Promise<any> {
        return await this.stockManager.createStock(productId, warehouse);
    }

    /**
     * Checks stock for a product
     */
    public async checkStock(productId: string | number, warehouse: any): Promise<any> {
        return await this.stockManager.checkStock(productId, warehouse);
    }

    /**
     * Logs message to file
     */
    public loggerToFile(message: string): void {
        this.utility.loggerToFile(message);
    }

    /**
     * Secondary logger to file
     */
    public secondloggerToFile(message: string): void {
        this.utility.secondloggerToFile(message);
    }

    /**
     * Maps order status from Prestashop to internal status
     */
    public orderStatusMap(orderState: string | number): string {
        return this.utility.orderStatusMap(orderState.toString()).toString();
    }
}

export default Prestashop;

import { PrestashopOrderManager } from "../model/prestashop/PrestashopOrderManager.js";
import { PrestashopProductManager } from "../model/prestashop/PrestashopProductManager.js";
import { PrestashopAttributeManager } from "../model/prestashop/PrestashopAttributeManager.js";
import { PrestashopStockManager } from "../model/prestashop/PrestashopStockManager.js";
import { PrestashopUtility } from "../model/prestashop/PrestashopUtility.js";

class Prestashop {
    context;
    getSchema;
    services;
    ItemsService;
    orderManager;
    productManager;
    attributeManager;
    stockManager;
    utility;

    constructor(context) {
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

    // Order related methods
    async getOrders() {
        return await this.orderManager.getOrders();
    }

    async getOrderMainTwo(orderId) {
        return await this.orderManager.getOrderMainTwo(orderId);
    }

    async getOrderMain(orderId, shopId) {
        return await this.orderManager.getOrderMain(orderId, shopId);
    }

    // Product related methods
    async getProduct(productExternalId, salesChannelId, salesChannelDomain, consumerKey, defaultWarehouse, taxRate, productAttributeId) {
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

    // Attribute related methods
    async checkAttribute(attributeName) {
        return await this.attributeManager.checkAttribute(attributeName);
    }

    async checkAttributeValue(attribute, value) {
        return await this.attributeManager.checkAttributeValue(attribute, value);
    }

    async getCombinations(salesChannelDomain, consumerKey, productAttributeId) {
        return await this.attributeManager.getCombinations(salesChannelDomain, consumerKey, productAttributeId);
    }

    async updateProductAttributes(product, salesChannelDomain, consumerKey, salesChannelProduct) {
        return await this.attributeManager.updateProductAttributes(product, salesChannelDomain, consumerKey, salesChannelProduct);
    }

    async getAttributesJson(appProductId, productService) {
        return await this.attributeManager.getAttributesJson(appProductId, productService);
    }

    // Stock related methods
    async createStock(productId, warehouse) {
        return await this.stockManager.createStock(productId, warehouse);
    }

    async checkStock(productId, warehouse) {
        return await this.stockManager.checkStock(productId, warehouse);
    }

    // Utility methods
    loggerToFile(message) {
        this.utility.loggerToFile(message);
    }

    secondloggerToFile(message) {
        this.utility.secondloggerToFile(message);
    }

    orderStatusMap(orderState) {
        return this.utility.orderStatusMap(orderState);
    }
}

export default Prestashop;

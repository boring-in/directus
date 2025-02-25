import axios from "axios";
import { xml2js } from "xml-js";
import Customer from "../../class/Customer";
import Order from "../../class/Order";
import DataProvider from "../../class/DataProvider";
import ExternalDataProvider from "../../class/ExternalDataProvider";
import fs from "fs";
import { PrestashopUtility } from "./PrestashopUtility";
import { PrestashopProductManager } from "./PrestashopProductManager";
import { time } from "console";
import  Log  from "../../class/Log";
/**
 * Interface for service initialization
 */
interface Services {
    warehouseProductService: any;
    productService: any;
    stockService: any;
    addressService: any;
    countryService: any;
    customerService: any;
    logService: any;
    orderService: any;
    salesProductService: any;
    salesChannelProductService: any;
    salesChannelService: any;
}

/**
 * Interface for order product data
 */
interface OrderProduct {
    id_product: number;
    id_product_attribute: number;
    warehouse: number;
    quantity: number;
    total: number;
    externalId: string;
    unit_price: number;
    app_warehouse: number;
}

/**
 * Interface for Prestashop order response
 */
interface PrestashopOrder {
    id_shop: number;
    firstname: string;
    lastname: string;
    email: string;
    address1: string | null;
    city: string | null;
    postcode: string | null;
    iso_code: string | null;
    phone_mobile: string;
    phone: string;
    customer_phone: string;
    products: string | null;
    current_state: string;
    date_add: string;
    shipping_type: string;
    shipping_tax: number;
    total_shipping: number;
    total_products: number;
    total_discounts: number;
    payment: string;
}

/**
 * Interface for processed order data
 */
interface OrderData {
    id_shop: string;
    firstname: string;
    lastname: string;
    email: string;
    address1: string;
    city: string;
    postcode: string;
    iso_code: string;
    phone_mobile: string;
    phone: string;
    customer_phone: string;
    products: OrderProduct[];
    current_state: string;
    date_add: string;
    shipping_type: string;
    shipping_tax: number;
    total_shipping: number;
    total_products: number;
    total_discounts: number;
    payment: string;
}

export class PrestashopOrderManager {
    private context: any;
    private getSchema: () => Promise<any>;
    private services: any;
    private ItemsService: any;
    private utility: PrestashopUtility;
    private productManager: PrestashopProductManager;

    constructor(context: any) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
        this.productManager = new PrestashopProductManager(context);
    }

    async getOrders(): Promise<void> {
        const schema = await this.getSchema();
        const dataProvider = new DataProvider(this.context);
        const missingOrders = await dataProvider.getMissingOrders();
        
      
        for (const order of missingOrders) {
            await this.getOrderMainTwo(order.id_order);
          
        }
    }

    async getOrderMainTwo(orderId: number): Promise<number> {
        const schema = await this.getSchema();
        const dataProvider = new DataProvider(this.context);
        const dbDataJson = {port :process.env.PS_PORT, host : process.env.PS_HOST ,user :process.env.PS_USER, password: process.env.PS_PASSWORD, database:process.env.PS_DATABASE};;
        
        const externalDataProvider = new ExternalDataProvider(
            dbDataJson.host,
            dbDataJson.port,
            dbDataJson.password,
            dbDataJson.user,
            dbDataJson.database
        );
        console.log(process.env.PS_PORT)
        let salesChannelName: string | null;
        let salesChannelInfo: any;
        const orderDataResponse = await externalDataProvider.getPrestashopOrder(orderId);
        externalDataProvider.endConnection();
        
        const prestashopOrder = orderDataResponse[0] as PrestashopOrder | undefined;
        Log.toFile("orderDataResponse", JSON.stringify(orderDataResponse));
        if (!prestashopOrder) {
            throw new Error(`No order found for ID: ${orderId}`);
        }

        if(prestashopOrder.products === null) {
            const orderImportErrorLogService = new this.ItemsService("order_import_error_log", {schema});
            await orderImportErrorLogService.createOne({order_id: orderId, note: "sql got products:null"});
            return 0;
        }

        const productsJson = JSON.parse(prestashopOrder.products) as OrderProduct[];
        if (productsJson.length === 0) {
            throw new Error(`No products found for order ID: ${orderId}`);
        }

        const firstProduct = productsJson[0];
        if (!firstProduct) {
            throw new Error(`First product is undefined for order ID: ${orderId}`);
        }
        
        productsJson.forEach(product => {
            const productExternalId = product.id_product_attribute === 0 ? 
                product.id_product.toString() : 
                `${product.id_product}_${product.id_product_attribute}`;
            
            product.externalId = productExternalId;
            product.unit_price = product.total / product.quantity;
            product.app_warehouse = this.mapWarehouse(product.warehouse);
        });

        const orderData: OrderData = {
            ...prestashopOrder,
            id_shop: prestashopOrder.id_shop.toString(),
            address1: prestashopOrder.address1 ?? "none",
            city: prestashopOrder.city ?? "none",
            postcode: prestashopOrder.postcode ?? "none",
            iso_code: prestashopOrder.iso_code ?? "none",
            products: productsJson
        };
        
        salesChannelName = this.getSalesChannelName(Number(orderData.id_shop), firstProduct.warehouse);
        if (!salesChannelName) {
            throw new Error(`Invalid shop ID: ${orderData.id_shop}`);
        }
        
        salesChannelInfo = await dataProvider.getSalesChannelDataByName(salesChannelName, "PS15");

        const customerService = new Customer(
            salesChannelInfo.id,
            orderData.firstname,
            orderData.lastname,
            orderData.email,
            orderData.iso_code,
            orderData.city,
            orderData.address1,
            orderData.postcode,
            orderData.phone_mobile,
            orderData.phone,
            orderData.customer_phone,
            this.ItemsService,
            schema
        );

        const customer = await customerService.getCustomer();
        
        const shippingAddress = {
            city: orderData.city,
            address: orderData.address1,
            postcode: orderData.postcode,
            country: orderData.iso_code
        };

        const orderStatus = this.utility.orderStatusMap(orderData.current_state);

const order = new Order(
    orderId.toString(),
    salesChannelInfo,
    orderData.date_add,
    orderData.products,
    orderStatus.toString(),
    // @ts-ignore
    customer,
    orderData.shipping_type,
    orderData.shipping_tax,
    orderData.total_shipping,
    orderData.total_products,
    orderData.total_discounts,
    orderData.total_products + orderData.total_shipping - orderData.total_discounts,
    orderData.payment,
    shippingAddress,
    this.ItemsService,
    schema
);

order.createOrder();
return 1;
}

private mapWarehouse(warehouseId: number): number {
switch(warehouseId) {
    case 5: return 1;
    case 6: return 2;
    default: return 3;
}
}

private getSalesChannelName(shopId: number, warehouse: number | null): string | null {
switch(shopId) {
    case 15: return "Geri Lesiai";
    case 14: return "Visas Lecas";
    case 16: return "Head Laatsed";
    case 18: return "Dom Soczewki";
    case 17: return "Wholesale";
    case 13:
        return warehouse === 5 ? "Zynky Akropolis" : 
               warehouse === 6 ? "Zynky Kalvariju" : null;
    default: return null;
}
}

async getOrderMain(orderId: number, shopId: number): Promise<number> {
const schema = await this.getSchema();
const services = this.initializeServices(schema);

try {
    const randomSalesChannel = await services.salesChannelService.readOne(1);
    const domain = randomSalesChannel.domain_name;
    const apiKey = randomSalesChannel.api_key;

    let salesChannelName = this.getSalesChannelName(Number(shopId), null);
    if (shopId === 13) {
        const orderData = await this.utility.getPrestashopJson(domain, apiKey, "orders", orderId);
        const cart = orderData.prestashop.order.associations.order_rows.order_row;
        const warehouse = Array.isArray(cart) ? cart[0].id_warehouse._cdata : cart.id_warehouse._cdata;
        salesChannelName = this.getSalesChannelName(13, Number(warehouse));
    }

    if (!salesChannelName) {
        throw new Error(`Invalid shop ID: ${shopId}`);
    }

    const salesChannelObj = await services.salesChannelService.readByQuery({
        filter: { name: salesChannelName },
        fields: ["id", "api_key", "domain_name", "default_warehouse"],
    });

    if (!salesChannelObj || salesChannelObj.length === 0) {
        throw new Error(`No sales channel found for name: ${salesChannelName}`);
    }

    await this.getOrder(
        Number(shopId),
        salesChannelObj[0].api_key,
        salesChannelObj[0].domain_name,
        orderId,
        services.customerService,
        services.countryService,
        services.addressService,
        services.salesChannelProductService,
        services.logService,
        services.orderService,
        services.salesProductService,
        salesChannelObj[0].id,
        salesChannelObj[0].default_warehouse,
        false,
        services.productService,
        services.warehouseProductService
    );

    return 1;
} catch(error) {
    console.log(error);
    const date = new Date();
    await services.logService.createOne({
        datetime: date,
        note: "order import error",
        error_message: error,
        order_id: orderId
    });
    return 0;
}
}

private async getOrder(
shopId: number,
apiKey: string,
domain: string,
orderId: number,
customerService: any,
countryService: any,
addressService: any,
salesChannelProductService: any,
logService: any,
orderService: any,
salesProductService: any,
salesChannelId: number,
defaultWarehouse: number,
isTest: boolean,
productService: any,
warehouseProductService: any
): Promise<void> {
// Implementation would go here
// This method was called but not implemented in the original JS
throw new Error("Method not implemented");
}

private initializeServices(schema: any): Services {
return {
    warehouseProductService: new this.ItemsService("warehouse_products", {schema}),
    productService: new this.ItemsService("product", {schema}),
    stockService: new this.ItemsService("stock", {schema}),
    addressService: new this.ItemsService("address", {schema}),
    countryService: new this.ItemsService("country", {schema}),
    customerService: new this.ItemsService("customers", {schema}),
    logService: new this.ItemsService("order_import_error_log", {schema}),
    orderService: new this.ItemsService("orders", {schema}),
    salesProductService: new this.ItemsService("order_products", {schema}),
    salesChannelProductService: new this.ItemsService("sales_channel_products", {schema}),
    salesChannelService: new this.ItemsService("sales_channel", {schema})
};
}
}
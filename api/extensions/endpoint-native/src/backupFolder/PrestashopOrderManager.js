import axios from "axios";
import { xml2js } from "xml-js";
import Customer from "../class/Customer";
import Order from "../class/Order";
import DataProvider from "../class/DataProvider";
import ExternalDataProvider from "../class/ExternalDataProvider";
import fs from "fs";
import { PrestashopUtility } from "../model/prestashop/PrestashopUtility";
import { PrestashopProductManager } from "../model/prestashop/PrestashopProductManager";

export class PrestashopOrderManager {
    context;
    getSchema;
    services;
    ItemsService;
    utility;
    productManager;

    constructor(context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
        this.productManager = new PrestashopProductManager(context);
    }

    async getOrders() {
        let schema = await this.getSchema();
        let dataProvider = new DataProvider(this.context);
        let missingOrders = await dataProvider.getMissingOrders();
        missingOrders.forEach(async (order) => {
            await this.getOrderMainTwo(order.id_order);
        });
    }

    async getOrderMainTwo(orderId) {
        let schema = await this.getSchema();
        let dataProvider = new DataProvider(this.context);
        let dbData = fs.readFileSync("DB.txt", 'utf8');
        let dbDataJson = JSON.parse(dbData);
        
        let externalDataProvider = new ExternalDataProvider(dbDataJson.host, dbDataJson.port, dbDataJson.password, dbDataJson.user, dbDataJson.database);
        
        let salesChannelName;
        let salesChannelInfo;
        let orderDataResponse = await externalDataProvider.getPrestashopOrder(orderId);
        
        let orderData = orderDataResponse[0];
        if(orderData.address1 == null) orderData.address1 = "none";
        if(orderData.city == null) orderData.city = "none";
        if(orderData.postcode == null) orderData.postcode = "none";
        if(orderData.iso_code == null) orderData.iso_code = "none";
        
        if(orderData.products == null) {
            let orderImportErrorLogService = new this.ItemsService("order_import_error_log", {schema:schema});
            await orderImportErrorLogService.createOne({order_id:orderId, note:"sql got products:null"});
            return 0;
        }

        let productsJson = JSON.parse(orderData.products);
        
        productsJson.forEach(product => {
            let productExternalId = product.id_product_attribute == 0 ? 
                product.id_product : 
                product.id_product + "_" + product.id_product_attribute;
            
            product.externalId = productExternalId;
            product.unit_price = product.total / product.quantity;
            product.app_warehouse = this.mapWarehouse(product.warehouse);
        });
        
        orderData.products = productsJson;
        
        salesChannelName = this.getSalesChannelName(Number.parseInt(orderData.id_shop), orderData.products[0].warehouse);
        salesChannelInfo = await dataProvider.getSalesChannelDataByName(salesChannelName, "PS15");

        let customerService = new Customer(
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

        let customer = await customerService.getCustomer();
        
        let shippingAddress = {
            city: orderData.city,
            address: orderData.address1,
            postcode: orderData.postcode,
            country: orderData.iso_code
        };

        let orderStatus = this.utility.orderStatusMap(orderData.current_state);
        
        let order = new Order(
            orderId,
            salesChannelInfo,
            orderData.date_add,
            orderData.products,
            orderStatus,
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
    }

    mapWarehouse(warehouseId) {
        switch(warehouseId) {
            case 5: return 1;
            case 6: return 2;
            default: return 3;
        }
    }

    getSalesChannelName(shopId, warehouse) {
        switch(shopId) {
            case 15: return "Geri Lesiai";
            case 14: return "Visas Lecas";
            case 16: return "Head Laatsed";
            case 18: return "Dom Soczewki";
            case 17: return "Wholesale";
            case 13:
                return warehouse == 5 ? "Zynky Akropolis" : 
                       warehouse == 6 ? "Zynky Kalvariju" : null;
            default: return null;
        }
    }

    async getOrderMain(orderId, shopId) {
        let schema = await this.getSchema();
        let services = this.initializeServices(schema);
        
        try {
            let randomSalesChannel = await services.salesChannelService.readOne(1);
            let domain = randomSalesChannel.domain_name;
            let apiKey = randomSalesChannel.api_key;

            let salesChannelName = this.getSalesChannelName(Number.parseInt(shopId), null);
            if (shopId === 13) {
                let orderData = await this.utility.getPrestashopJson(domain, apiKey, "orders", orderId);
                let cart = orderData.prestashop.order.associations.order_rows.order_row;
                let warehouse = Array.isArray(cart) ? cart[0].id_warehouse._cdata : cart.id_warehouse._cdata;
                salesChannelName = this.getSalesChannelName(13, Number(warehouse));
            }

            let salesChannelObj = await services.salesChannelService.readByQuery({
                filter: { name: salesChannelName },
                fields: ["id", "api_key", "domain_name", "default_warehouse"],
            });

            await this.getOrder(
                shopId,
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
            let date = new Date();
            await services.logService.createOne({
                datetime: date,
                note: "order import error",
                error_message: error,
                order_id: orderId
            });
            return 0;
        }
    }

    initializeServices(schema) {
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

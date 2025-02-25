import axios from "axios";
import { xml2js } from "xml-js";
import { PrestashopUtility } from "../model/prestashop/PrestashopUtility";
import { PrestashopAttributeManager } from "../model/prestashop/PrestashopAttributeManager";
import { PrestashopStockManager } from "../model/prestashop/PrestashopStockManager";

export class PrestashopProductManager {
    context;
    getSchema;
    services;
    ItemsService;
    utility;
    attributeManager;
    stockManager;

    constructor(context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
        this.attributeManager = new PrestashopAttributeManager(context);
        this.stockManager = new PrestashopStockManager(context);
    }

    async getProduct(productExternalId, salesChannelId, salesChannelDomain, consumerKey, defaultWarehouse, taxRate, productAttributeId) {
        this.utility.loggerToFile(`getProduct function start productExternalId:${productExternalId}`);
        
        let schema = await this.getSchema();
        let productService = new this.ItemsService("product", { schema });
        let salesChannelProductService = new this.ItemsService("sales_channel_products", { schema });
        let productAttributeValueService = new this.ItemsService("attribute_value_product", { schema });
        
        let externalIdWithAttribute = productExternalId + "_" + productAttributeId;
        
        try {
            let productJson = await this.utility.getPrestashopJson(salesChannelDomain, consumerKey, "products", productExternalId);
            let psProduct = productJson.prestashop.product;
            
            let name = psProduct.name.language[0]._cdata;
            let attributeCombinationMeta = psProduct.associations.combinations.combinations;
            let attributeCombinations = [];
            
            if (Array.isArray(attributeCombinationMeta)) {
                attributeCombinations = attributeCombinationMeta;
            } else if (attributeCombinationMeta) {
                attributeCombinations.push(attributeCombinationMeta);
            }

            let parentProduct = await productService.readByQuery({
                filter: { _and: [{ name: { _eq: name } }, { child_products: { _eq: null } }] },
            }, { fields: ["*"] });

            if (parentProduct.length > 0) {
                await this.handleExistingProduct(
                    parentProduct[0],
                    productAttributeId,
                    externalIdWithAttribute,
                    salesChannelDomain,
                    consumerKey,
                    salesChannelId,
                    productExternalId,
                    defaultWarehouse,
                    taxRate,
                    productService,
                    salesChannelProductService,
                    productAttributeValueService
                );
            } else {
                await this.createNewProduct(
                    name,
                    attributeCombinations,
                    productExternalId,
                    salesChannelDomain,
                    consumerKey,
                    salesChannelId,
                    defaultWarehouse,
                    taxRate,
                    productService,
                    salesChannelProductService,
                    productAttributeValueService
                );
            }
        } catch (error) {
            console.error("Error in getProduct:", error);
            this.utility.loggerToFile(`Error in getProduct: ${error.message}`);
        }
    }

    async handleExistingProduct(parentProduct, productAttributeId, externalIdWithAttribute, salesChannelDomain, consumerKey, salesChannelId, productExternalId, defaultWarehouse, taxRate, productService, salesChannelProductService, productAttributeValueService) {
        let attributedProduct = await productService.readByQuery(
            { filter: { external_id: { _eq: externalIdWithAttribute } } },
            { fields: ["*.*"] }
        );

        if (attributedProduct.length === 0 && productAttributeId) {
            let finalAttributeArray = await this.attributeManager.getCombinations(salesChannelDomain, consumerKey, productAttributeId);
            
            let newChildProduct = await productService.createOne({
                name: parentProduct.name,
                parent_product: parentProduct.product_id,
            });

            await this.attributeManager.createAttributeValues(
                finalAttributeArray,
                newChildProduct,
                parentProduct.product_id,
                productAttributeValueService
            );

            let childList = parentProduct.child_products || [];
            childList.push(newChildProduct);
            await productService.updateOne(parentProduct.product_id, { child_products: childList });
        }

        await this.createOrUpdateSalesChannelProducts(
            parentProduct,
            salesChannelId,
            productExternalId,
            taxRate,
            defaultWarehouse,
            salesChannelProductService
        );
    }

    async createNewProduct(name, attributeCombinations, externalId, salesChannelDomain, consumerKey, salesChannelId, defaultWarehouse, taxRate, productService, salesChannelProductService, productAttributeValueService) {
        let parentProduct = await productService.createOne({ name: name });
        await this.stockManager.createStock(parentProduct, defaultWarehouse);
        await this.createSalesChannelProduct(name, salesChannelId, externalId, parentProduct, taxRate, salesChannelProductService);

        let childIds = [];
        for (let combination of attributeCombinations) {
            if (combination.id?._cdata) {
                let combinationId = combination.id._cdata;
                let finalAttributeArray = await this.attributeManager.getCombinations(salesChannelDomain, consumerKey, combinationId);
                
                let childExternalId = `${externalId}_${combinationId}`;
                let child = await productService.createOne({
                    name: name,
                    attributes: finalAttributeArray,
                    parent_product: parentProduct,
                });

                await this.attributeManager.createAttributeValues(
                    finalAttributeArray,
                    child,
                    null,
                    productAttributeValueService
                );

                await this.stockManager.createStock(child, defaultWarehouse);
                await this.createSalesChannelProduct(name, salesChannelId, childExternalId, child, taxRate, salesChannelProductService);
                
                childIds.push(child);
            }
        }

        if (childIds.length > 0) {
            await productService.updateOne(parentProduct, { child_products: childIds });
        }
    }

    async createSalesChannelProduct(name, salesChannelId, externalId, productId, taxRate, salesChannelProductService) {
        return await salesChannelProductService.createOne({
            sales_channel_product_name: name,
            sales_channel: salesChannelId,
            sales_channel_product_id: externalId,
            product: productId,
            tax_rate: taxRate
        });
    }

    async createOrUpdateSalesChannelProducts(parentProduct, salesChannelId, productExternalId, taxRate, defaultWarehouse, salesChannelProductService) {
        let appParentSalesChannelProduct = await salesChannelProductService.readByQuery({
            filter: {
                _and: [
                    { sales_channel_product_id: { _eq: productExternalId } },
                    { sales_channel: { _eq: salesChannelId } },
                ],
            },
            fields: ["*.*"]
        });

        if (appParentSalesChannelProduct.length === 0) {
            await this.createSalesChannelProduct(
                parentProduct.name,
                salesChannelId,
                productExternalId,
                parentProduct.product_id,
                taxRate,
                salesChannelProductService
            );

            await this.stockManager.checkStock(parentProduct.product_id, defaultWarehouse);

            if (parentProduct.child_products) {
                for (let childProduct of parentProduct.child_products) {
                    await this.createSalesChannelProduct(
                        childProduct.name,
                        salesChannelId,
                        childProduct.external_id,
                        childProduct.product_id,
                        taxRate,
                        salesChannelProductService
                    );
                    await this.stockManager.checkStock(childProduct.product_id, defaultWarehouse);
                }
            }
        }
    }
}

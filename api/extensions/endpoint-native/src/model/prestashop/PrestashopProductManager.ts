import axios from "axios";
import { xml2js } from "xml-js";
import { PrestashopUtility } from "./PrestashopUtility";
import { PrestashopAttributeManager } from "./PrestashopAttributeManager";
import { PrestashopStockManager } from "./PrestashopStockManager";

/**
 * Interface for the context object passed to the constructor
 */
interface Context {
    getSchema: () => Promise<any>;
    services: {
        ItemsService: new (name: string, options: { schema: any }) => ItemsService;
    };
}

/**
 * Interface for the ItemsService class
 */
interface ItemsService {
    readByQuery: (query: any, options?: any) => Promise<any[]>;
    createOne: (data: any) => Promise<any>;
    updateOne: (id: any, data: any) => Promise<any>;
    readOne: (id: string | number, options: any) => Promise<any>;
}

/**
 * Interface for Prestashop product response
 */
interface PrestashopProduct {
    name: {
        language: Array<{
            _cdata: string;
        }>;
    };
    associations: {
        combinations: {
            combinations: CombinationMeta | CombinationMeta[];
        };
    };
}

/**
 * Interface for combination metadata
 */
interface CombinationMeta {
    id?: {
        _cdata: string;
    };
}

/**
 * Class to manage Prestashop product operations
 */
export class PrestashopProductManager {
    private context: Context;
    private getSchema: () => Promise<any>;
    private services: Context['services'];
    private ItemsService: Context['services']['ItemsService'];
    private utility: PrestashopUtility;
    private attributeManager: PrestashopAttributeManager;
    private stockManager: PrestashopStockManager;

    constructor(context: Context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
        this.attributeManager = new PrestashopAttributeManager(context);
        this.stockManager = new PrestashopStockManager(context);
    }

    /**
     * Retrieves and processes a product from Prestashop
     */
    async getProduct(
        productExternalId: string,
        salesChannelId: number,
        salesChannelDomain: string,
        consumerKey: string,
        defaultWarehouse: string,
        taxRate: number,
        productAttributeId: string
    ): Promise<void> {
        this.utility.loggerToFile(`getProduct function start productExternalId:${productExternalId}`);
        
        let schema = await this.getSchema();
        let productService = new this.ItemsService("product", { schema });
        let salesChannelProductService = new this.ItemsService("sales_channel_products", { schema });
        let productAttributeValueService = new this.ItemsService("attribute_value_product", { schema });
        
        let externalIdWithAttribute = productExternalId + "_" + productAttributeId;
        
        try {
            let productJson = await this.utility.getPrestashopJson(salesChannelDomain, consumerKey, "products", productExternalId);
            let psProduct = productJson.prestashop.product as PrestashopProduct;
            
            let name = psProduct.name.language[0]?._cdata || '';
            if (!name) {
                throw new Error('Product name is missing in the response');
            }

            let attributeCombinationMeta = psProduct.associations.combinations.combinations;
            let attributeCombinations: CombinationMeta[] = [];
            
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
            this.utility.loggerToFile(`Error in getProduct: ${(error as Error).message}`);
        }
    }

    /**
     * Handles processing of an existing product
     */
    private async handleExistingProduct(
        parentProduct: any,
        productAttributeId: string,
        externalIdWithAttribute: string,
        salesChannelDomain: string,
        consumerKey: string,
        salesChannelId: number,
        productExternalId: string,
        defaultWarehouse: string,
        taxRate: number,
        productService: ItemsService,
        salesChannelProductService: ItemsService,
        productAttributeValueService: ItemsService
    ): Promise<void> {
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

    /**
     * Creates a new product with its variations
     */
    private async createNewProduct(
        name: string,
        attributeCombinations: CombinationMeta[],
        externalId: string,
        salesChannelDomain: string,
        consumerKey: string,
        salesChannelId: number,
        defaultWarehouse: string,
        taxRate: number,
        productService: ItemsService,
        salesChannelProductService: ItemsService,
        productAttributeValueService: ItemsService
    ): Promise<void> {
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

    /**
     * Creates a sales channel product
     */
    private async createSalesChannelProduct(
        name: string,
        salesChannelId: number,
        externalId: string,
        productId: any,
        taxRate: number,
        salesChannelProductService: ItemsService
    ): Promise<any> {
        return await salesChannelProductService.createOne({
            sales_channel_product_name: name,
            sales_channel: salesChannelId,
            sales_channel_product_id: externalId,
            product: productId,
            tax_rate: taxRate
        });
    }

    /**
     * Creates or updates sales channel products for a parent product and its children
     */
    private async createOrUpdateSalesChannelProducts(
        parentProduct: any,
        salesChannelId: number,
        productExternalId: string,
        taxRate: number,
        defaultWarehouse: string,
        salesChannelProductService: ItemsService
    ): Promise<void> {
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

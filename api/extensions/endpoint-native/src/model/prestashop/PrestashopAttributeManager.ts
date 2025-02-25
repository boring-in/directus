import axios from "axios";
import { xml2js, ElementCompact } from "xml-js";
import { PrestashopUtility } from "./PrestashopUtility";

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
    readByQuery: (query: any) => Promise<any[]>;
    createOne: (data: any) => Promise<any>;
    readOne: (id: string | number, options: any) => Promise<any>;
}

/**
 * Interface for attribute data
 */
interface AttributeData {
    prop: string;
    name: string;
}

/**
 * Interface for product data
 */
interface Product {
    product_id: string | number;
    parent_product: string | number | null;
}

/**
 * Interface for sales channel product data
 */
interface SalesChannelProduct {
    sales_channel_product_id: string;
}

/**
 * Interface for product option value
 */
interface ProductOptionValue {
    id: { _cdata: string; };
}

/**
 * Interface for language data
 */
interface LanguageData {
    _cdata: string;
}

/**
 * Interface for Prestashop API responses
 */
interface PrestashopResponse extends ElementCompact {
    prestashop: {
        combination: {
            associations: {
                product_option_values: {
                    product_option_value: ProductOptionValue | ProductOptionValue[];
                };
            };
        };
        product_option_value: {
            name: {
                language: LanguageData[];
            };
            id_attribute_group: {
                _cdata: string;
            };
        };
        product_option: {
            name: {
                language: LanguageData[];
            };
        };
        product?: {
            id_default_combination?: {
                _cdata: string;
            };
        };
    };
}

export class PrestashopAttributeManager {
    private context: Context;
    private getSchema: () => Promise<any>;
    private services: Context['services'];
    private ItemsService: Context['services']['ItemsService'];
    private utility: PrestashopUtility;

    constructor(context: Context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
    }

    async checkAttribute(attributeName: string): Promise<string | number> {
        let schema = await this.getSchema();
        let attributeService = new this.ItemsService("attributes", {schema});
        let attribute = await attributeService.readByQuery({filter: {name: {_eq: attributeName}}});
        
        if (attribute.length === 0) {
            const newAttribute = await attributeService.createOne({name: attributeName});
            return newAttribute;
        }
        
        return attribute[0].id;
    }

    async checkAttributeValue(attribute: string | number, value: string): Promise<string | number> {
        this.utility.loggerToFile("checkAttributeValue function started");
        let schema = await this.getSchema();
        let attributeValueService = new this.ItemsService("attribute_value", {schema});
        
        let attributeValue = await attributeValueService.readByQuery({
            filter: {
                _and: [
                    {attribute: {_eq: attribute}},
                    {value: {_eq: value}}
                ]
            }
        });

        if (attributeValue.length === 0) {
            const newAttributeValue = await attributeValueService.createOne({
                attribute: attribute,
                value: value
            });
            return newAttributeValue;
        }

        this.utility.loggerToFile("attributeValue:" + attributeValue[0].id);
        return attributeValue[0].id;
    }

    async getCombinations(salesChannelDomain: string, consumerKey: string, productAttributeId: string): Promise<AttributeData[]> {
        this.utility.loggerToFile("getCombinations function started");
        let combinationResponse = await this.utility.getPrestashopJson(
            salesChannelDomain,
            consumerKey,
            "combinations",
            productAttributeId
        );

        let combination = (combinationResponse as PrestashopResponse).prestashop.combination;
        let attributes = combination.associations.product_option_values.product_option_value;
        let attributeIdArray: string[] = [];
        let finalAttributeArray: AttributeData[] = [];

        this.utility.loggerToFile("attributes:" + JSON.stringify(attributes));

        if (Array.isArray(attributes)) {
            attributes.forEach((attribute: ProductOptionValue) => {
                if (attribute && attribute.id && attribute.id._cdata) {
                    attributeIdArray.push(attribute.id._cdata);
                }
            });
        } else if (attributes && attributes.id && attributes.id._cdata) {
            attributeIdArray.push(attributes.id._cdata);
        }

        for (let attributeId of attributeIdArray) {
            let optionValueResponse = await axios.get(
                `https://${consumerKey}@${salesChannelDomain}/api/product_option_values/${attributeId}`
            );
            
            let optionJson = xml2js(optionValueResponse.data, { compact: true }) as PrestashopResponse;
            let optionData = optionJson.prestashop.product_option_value;
            let optionProp = optionData.name.language[0]?._cdata || '';
            if (!optionProp) {
                this.utility.loggerToFile("Warning: Missing option property value for attribute ID: " + attributeId);
                continue;
            }

            let attributeGroupId = optionData.id_attribute_group._cdata;
            let attributeGroupResponse = await axios.get(
                `https://${consumerKey}@${salesChannelDomain}/api/product_options/${attributeGroupId}`
            );
            
            let attributeGroupJson = xml2js(attributeGroupResponse.data, { compact: true }) as PrestashopResponse;
            let attributeGroupData = attributeGroupJson.prestashop.product_option;
            let attributeName = attributeGroupData.name.language[1]?._cdata || attributeGroupData.name.language[0]?._cdata || '';
            if (!attributeName) {
                this.utility.loggerToFile("Warning: Missing attribute name for attribute ID: " + attributeId);
                continue;
            }

            finalAttributeArray.push({
                prop: optionProp.toString(),
                name: attributeName.toString()
            });
        }

        return finalAttributeArray;
    }

    async updateProductAttributes(
        product: Product,
        salesChannelDomain: string,
        consumerKey: string,
        salesChannelProduct: SalesChannelProduct
    ): Promise<void> {
        this.utility.loggerToFile("updateProductAttributes function started for product:" + product.product_id);
        let schema = await this.getSchema();
        let productAttributeValueService = new this.ItemsService("attribute_value_product", {schema});

        let productAttributeId = salesChannelProduct.sales_channel_product_id.split('_')[1];
        this.utility.loggerToFile("productAttributeId:" + productAttributeId);

        if (productAttributeId) {
            this.utility.loggerToFile("product attribute should not be undefined attribute id:" + productAttributeId);
            let combinationArray = await this.getCombinations(salesChannelDomain, consumerKey, productAttributeId);
            await this.createAttributeValues(combinationArray, product.product_id, product.parent_product, productAttributeValueService);
        } else {
            this.utility.loggerToFile("product attribute is undefined");
            let externalProductId = salesChannelProduct.sales_channel_product_id;
            let externalProductJson = await this.utility.getPrestashopJson(salesChannelDomain, consumerKey, "products", externalProductId);
            
            let combinationId = (externalProductJson as PrestashopResponse).prestashop.product?.id_default_combination?._cdata;
            if (combinationId) {
                let combinationArray = await this.getCombinations(salesChannelDomain, consumerKey, combinationId);
                await this.createAttributeValues(combinationArray, product.product_id, null, productAttributeValueService);
            }
        }
    }

    async createAttributeValues(
        attributeArray: AttributeData[],
        productId: string | number,
        parentProductId: string | number | null,
        productAttributeValueService: ItemsService
    ): Promise<void> {
        for (let attribute of attributeArray) {
            let appAttribute = await this.checkAttribute(attribute.name);
            let appAttributeValue = await this.checkAttributeValue(appAttribute, attribute.prop);
            
            await productAttributeValueService.createOne({
                attribute_value_id: appAttributeValue,
                product_product_id: productId
            });

            if (parentProductId) {
                await productAttributeValueService.createOne({
                    attribute_value_id: appAttributeValue,
                    product_product_id: parentProductId
                });
            }
        }
    }

    async getAttributesJson(appProductId: string | number, productService: ItemsService): Promise<Record<string, string>[] | Error> {
        try {
            let productData = await productService.readOne(appProductId, {
                fields: [
                    'attribute_value.attribute_value_id.value',
                    'attribute_value.attribute_value_id.attribute.name'
                ]
            });

            let attributeValueData = productData.attribute_value;
            let attributeJsonArray: Record<string, string>[] = [];

            for (let attributeValue of attributeValueData) {
                let value = attributeValue.attribute_value_id;
                attributeJsonArray.push({
                    [value.attribute.name]: value.value
                });
            }

            return attributeJsonArray;
        } catch(err) {
            return err as Error;
        }
    }
}

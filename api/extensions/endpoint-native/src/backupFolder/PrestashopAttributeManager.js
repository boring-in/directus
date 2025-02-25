import axios from "axios";
import { xml2js } from "xml-js";
import { PrestashopUtility } from "../model/prestashop/PrestashopUtility";

export class PrestashopAttributeManager {
    context;
    getSchema;
    services;
    ItemsService;
    utility;

    constructor(context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
        this.utility = new PrestashopUtility();
    }

    async checkAttribute(attributeName) {
        let schema = await this.getSchema();
        let attributeService = new this.ItemsService("attributes", {schema});
        let attribute = await attributeService.readByQuery({filter: {name: {_eq: attributeName}}});
        
        if (attribute.length === 0) {
            attribute = await attributeService.createOne({name: attributeName});
        } else {
            attribute = attribute[0].id;
        }
        
        return attribute;
    }

    async checkAttributeValue(attribute, value) {
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
            attributeValue = await attributeValueService.createOne({
                attribute: attribute,
                value: value
            });
        } else {
            attributeValue = attributeValue[0].id;
        }

        this.utility.loggerToFile("attributeValue:" + attributeValue);
        return attributeValue;
    }

    async getCombinations(salesChannelDomain, consumerKey, productAttributeId) {
        this.utility.loggerToFile("getCombinations function started");
        let combinationResponse = await this.utility.getPrestashopJson(
            salesChannelDomain,
            consumerKey,
            "combinations",
            productAttributeId
        );

        let combination = combinationResponse.prestashop.combination;
        let attributes = combination.associations.product_option_values.product_option_value;
        let attributeIdArray = [];
        let finalAttributeArray = [];

        this.utility.loggerToFile("attributes:" + JSON.stringify(attributes));

        if (Array.isArray(attributes)) {
            attributes.forEach(attribute => {
                attributeIdArray.push(attribute.id._cdata);
            });
        } else {
            attributeIdArray.push(attributes.id._cdata);
        }

        for (let attributeId of attributeIdArray) {
            let optionValueResponse = await axios.get(
                `https://${consumerKey}@${salesChannelDomain}/api/product_option_values/${attributeId}`
            );
            
            let optionJson = xml2js(optionValueResponse.data, {compact: true, spaces: 4});
            let optionData = optionJson.prestashop.product_option_value;
            let optionProp = optionData.name.language[0]._cdata.toString();

            let attributeGroupId = optionData.id_attribute_group._cdata;
            let attributeGroupResponse = await axios.get(
                `https://${consumerKey}@${salesChannelDomain}/api/product_options/${attributeGroupId}`
            );
            
            let attributeGroupJson = xml2js(attributeGroupResponse.data, {compact: true, spaces: 4});
            let attributeGroupData = attributeGroupJson.prestashop.product_option;
            let attributeName = attributeGroupData.name.language[1]._cdata.toString();

            finalAttributeArray.push({
                prop: optionProp,
                name: attributeName
            });
        }

        return finalAttributeArray;
    }

    async updateProductAttributes(product, salesChannelDomain, consumerKey, salesChannelProduct) {
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
            
            let combinationId = externalProductJson.prestashop.product.id_default_combination?._cdata;
            if (combinationId) {
                let combinationArray = await this.getCombinations(salesChannelDomain, consumerKey, combinationId);
                await this.createAttributeValues(combinationArray, product.product_id, null, productAttributeValueService);
            }
        }
    }

    async createAttributeValues(attributeArray, productId, parentProductId, productAttributeValueService) {
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

    async getAttributesJson(appProductId, productService) {
        try {
            let productData = await productService.readOne(appProductId, {
                fields: [
                    'attribute_value.attribute_value_id.value',
                    'attribute_value.attribute_value_id.attribute.name'
                ]
            });

            let attributeValueData = productData.attribute_value;
            let attributeJsonArray = [];

            for (let attributeValue of attributeValueData) {
                let value = attributeValue.attribute_value_id;
                attributeJsonArray.push({
                    [value.attribute.name]: value.value
                });
            }

            return attributeJsonArray;
        } catch(err) {
            return err;
        }
    }
}

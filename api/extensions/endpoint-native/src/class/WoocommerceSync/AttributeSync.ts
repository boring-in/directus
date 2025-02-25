import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { SalesChannel } from "./types";

interface WooCommerceAttribute {
  id: number;
  name: string;
  slug: string;
  type: string;
  order_by: string;
  has_archives: boolean;
}

interface WooCommerceAttributeTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  menu_order: number;
  count: number;
}

interface SyncResult {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

export class AttributeSync {
  private api: WooCommerceRestApi;
  private attributeService: any;
  private attributeValueService: any;
  private attributeValueProductService: any;

  constructor(api: WooCommerceRestApi, ItemsService: any, schema: any) {
    this.api = api;
    this.attributeService = new ItemsService("attributes", { schema: schema });
    this.attributeValueService = new ItemsService("attribute_value", { schema: schema });
    this.attributeValueProductService = new ItemsService("attribute_value_product", { schema: schema });
  }

  /**
   * Simplified setAttribute method for use during product import
   */
  async setAttributeSimple(productId: string | number, featureName: string, value: string, reference?: string): Promise<void> {
    let localAttribute = await this.attributeService.readByQuery({filter:{name: {_eq: featureName}}});
    if (localAttribute.length == 0) {
      let newAttribute = await this.createAttribute(featureName, reference || featureName);
      localAttribute = {id: newAttribute,name: featureName, reference: reference || null};
    }
    else {
      localAttribute = localAttribute[0];
    }
    let localAttributeValue = await this.attributeValueService.readByQuery({filter:{_and:[{attribute: {_eq:localAttribute.id}},{value: {_eq:value}}]}});
    if (localAttributeValue.length == 0) {
      let newAttributeValue = await this.createAttributeValue(localAttribute.id, value);
      localAttributeValue = {id: newAttributeValue, attribute: localAttribute.id, value: value};
    }
    else {
      localAttributeValue = localAttributeValue[0];
    }
    await this.attributeValueProductService.createOne({product_product_id: productId, attribute_value_id: localAttributeValue.id});
  }

  /**
   * Creates attribute in local system
   */
  async createAttribute(attributeName: string, attrributeSlug:string): Promise<any> {
    return this.attributeService.createOne({name: attributeName, reference: attrributeSlug});
  }

  /**
   * Creates attribute value in local system
   */
  async createAttributeValue(attributeId: string|number, value: string): Promise<any> {
    return this.attributeValueService.createOne({attribute:attributeId, value: value});
  }

  /**
   * Syncs attribute with WooCommerce
   */
  async syncAttribute(attributeId: string): Promise<any> {
    const attribute = await this.attributeService.readOne(attributeId);
    if (!attribute) {
      throw new Error('Attribute not found');
    }

    const attributereference = attribute.reference;
    const wcAttributesInfo = await this.api.get("products/attributes");
    const wcAttributes = wcAttributesInfo.data;
    const wcAttribute = wcAttributes.find((obj: any) => obj.slug === "pa_" + attributereference);
    
    if (wcAttribute == undefined) {
      const data = {
        name: attribute.name,
        slug: attributereference || attribute.name.toLowerCase().replace(/\s+/g, '-'),
        type: "select",
        order_by: "menu_order",
        has_archives: false
      };
      const newWcAttribute = await this.api.post("products/attributes", data);
      return newWcAttribute.data;
    }
    
    return wcAttribute;
  }

  /**
   * Imports attributes from WooCommerce to local system
   * @returns Summary of sync operation
   */
  async importAttributesFromWooCommerce(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    try {
      // Get all WooCommerce attributes
      const wcAttributesResponse = await this.api.get("products/attributes");
      const wcAttributes: WooCommerceAttribute[] = wcAttributesResponse.data;

      for (const wcAttribute of wcAttributes) {
        try {
          // Remove 'pa_' prefix from WooCommerce slug
          const reference = wcAttribute.slug.replace(/^pa_/, '');

          // Check if attribute exists locally
          const existingAttributes = await this.attributeService.readByQuery({
            filter: { reference: reference }
          });

          let localAttributeId;

          if (existingAttributes.length === 0) {
            // Create new attribute
            const newAttribute = await this.attributeService.createOne({
              name: wcAttribute.name,
              reference: reference
            });
            localAttributeId = newAttribute;
            result.created++;
          } else {
            // Update existing attribute
            localAttributeId = existingAttributes[0].id;
            await this.attributeService.updateOne(localAttributeId, {
              name: wcAttribute.name
            });
            result.updated++;
          }

          // Get attribute terms (values) from WooCommerce
          const termsResponse = await this.api.get(
            `products/attributes/${wcAttribute.id}/terms`
          );
          const terms: WooCommerceAttributeTerm[] = termsResponse.data;

          // Create/update terms in local system
          for (const term of terms) {
            try {
              const existingValues = await this.attributeService.readByQuery({
                filter: {
                  _and: [
                    { attribute: localAttributeId },
                    { value: term.name }
                  ]
                }
              });

              if (existingValues.length === 0) {
                await this.attributeService.createOne({
                  attribute: localAttributeId,
                  value: term.name
                });
              }
            } catch (error: any) {
              result.failed++;
              result.errors.push(
                `Failed to sync term ${term.name} for attribute ${wcAttribute.name}: ${error.message}`
              );
            }
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push(
            `Failed to sync attribute ${wcAttribute.name}: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      result.failed++;
      result.errors.push(`Failed to fetch WooCommerce attributes: ${error.message}`);
    }

    return result;
  }
}

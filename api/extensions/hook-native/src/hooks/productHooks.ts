import { filter } from "async";
import type { Knex } from "knex";
import DataProvider from "../model/DataProvider";
import DataWriter from "../model/DataWriter";

interface Services {
  ItemsService: new (collection: string, options: ItemsServiceOptions) => ItemsService;
}

interface ItemsServiceOptions {
  schema: Schema;
}

interface Schema {
  collections: Record<string, any>;
}

interface ItemsService {
  readOne(id: number, options?: { fields: string[] | "*" }): Promise<any>;
  readMany(ids: number[]): Promise<any[]>;
  readByQuery(query: { filter?: Record<string, any>; search?: string }): Promise<any[]>;
  createOne(data: Record<string, any>): Promise<number>;
  updateOne(id: number, data: Record<string, any>): Promise<any>;
  deleteOne(id: number): Promise<void>;
}

interface AttributeValue {
  id: number;
  value: string;
  reference?: string;
  attribute: number;
}

interface Attribute {
  id: number;
  name: string;
  reference?: string;
  attribute: number;
}

interface Product {
  feature: any;
  product_id: number;
  name: string;
  sku: string;
  parent_product: number | null;
  child_products?: number[];
  attribute_value?: Array<{
    attribute_value_id: {
      value: string;
      attribute: {
        name: string;
      };
    };
  }>;
  create_childs?: boolean;
}

interface CreatePayload {
  key: number;
  payload: {
    create_childs?: boolean;
    attribute_value?: {
      create: AttributeValueWithId[];
    };
  };
}

interface AttributeValueWithId {
  attribute_value_id: {
    id: number;
  };
}

interface SalesChannelCreate {
  sales_channel_id: {
    id: number;
  };
}

interface UpdatePayload {
  keys: number[];
  payload: {
    use_parent_suppliers: boolean;
    attribute_value?: any;
    sales_channels?: {
      create: SalesChannelCreate[];
    };
    use_parent_feature?: boolean;
    use_parent_groups?: boolean;
    use_parent_tags?: boolean;
    use_parent_sales_channel?: boolean;
    use_parent_general?: boolean;
    status?: number;
  };
}

interface ProductTagPayload {
  product: number;
  tags: {
    name: string;
  };
}
interface HookContext {
  services: Services;
  database: Knex;
  getSchema: () => Promise<Schema>;
}

type AttributeValueArray = AttributeValue[];
type AttributeValueMatrix = AttributeValue[][];

/**
 * Sets up hooks for product-related operations
 */
export const setupProductHooks = ({ services, database, getSchema  }: HookContext) => {
  const { ItemsService } = services;

  /**
   * Creates child products with attribute combinations
   */
  async function childCreator(parentId: number, combinationArray: AttributeValueMatrix): Promise<void> {
    const productService = new ItemsService('product', { schema: await getSchema() });
    const attributeService = new ItemsService('attributes', { schema: await getSchema() });
    const attributeValueProductService = new ItemsService('attribute_value_product', { schema: await getSchema() });
    const parent = await productService.readOne(parentId, { fields: ["*"] }) as Product;

    if (!parent || !parent.sku) {
      throw new Error(`Parent product ${parentId} not found or missing SKU`);
    }

    for (const combination of combinationArray) {
      const newChild = await productService.createOne({ 
        name: parent.name, 
        parent_product: parent.product_id, 
        sku: "tempSku" 
      });
      let skuString = parent.sku + "/";

      for (const attributeValue of combination) {
        if (!attributeValue?.id || !attributeValue?.attribute) {
          continue;
        }

        await attributeValueProductService.createOne({ 
          attribute_value_id: attributeValue.id, 
          product_product_id: newChild 
        });

        const attribute = await attributeService.readOne(attributeValue.attribute) as Attribute;
        if (!attribute) continue;

        let valueRef = attributeValue.reference;
        let attributeRef = attribute.reference;
        
        if (!valueRef && attributeValue.value) {
          valueRef = attributeValue.value.toUpperCase();
        }
        if (!attributeRef && attribute.name) {
          attributeRef = attribute.name.toUpperCase();
        }

        if (valueRef && attributeRef) {
          const refString = attributeRef + valueRef;
          skuString += refString + "_";
        }
      }
      await productService.updateOne(newChild, { sku: skuString.trim() });
    }
  }

  /**
   * Creates combinations of attribute values
   */
  function combinationCreator(array: AttributeValueMatrix): AttributeValueArray | AttributeValueMatrix {
    if (!array || array.length === 0) {
      return [];
    }

    if (array.length > 1) {
      const result: AttributeValueMatrix = [];
      const otherComb = combinationCreator(array.slice(1));
      
      if (!Array.isArray(otherComb)) {
        return array[0] || [];
      }

      for (const item of array[0] || []) {
        for (const combination of otherComb) {
          if (Array.isArray(combination)) {
            result.push([item, ...combination]);
          } else {
            result.push([item, combination]);
          }
        }
      }
      return result;
    }
    
    return array[0] || [];
  }

  /**
   * Sorts attributes into groups
   */
  async function attributeSorter(
    array: AttributeValueWithId[], 
    attributeService: ItemsService
  ): Promise<AttributeValueMatrix> {
    const sortedArray: AttributeValueMatrix = [];

    for (const attribute_value of array) {
      const id = attribute_value?.attribute_value_id?.id;
      if (typeof id !== 'number') continue;

      const attribute = await attributeService.readOne(id) as AttributeValue;
      if (!attribute?.attribute) continue;

      let found = false;

      if (sortedArray.length > 0) {
        for (const group of sortedArray) {
          if (group[0] && group[0].attribute === attribute.attribute) {
            group.push(attribute);
            found = true;
            break;
          }
        }
        
        if (!found) {
          sortedArray.push([attribute]);
        }
      } else {
        sortedArray.push([attribute]);
      }
    }
    return sortedArray;
  }

  return {
    'product.items.create': {
      action: async (input: CreatePayload): Promise<CreatePayload> => {
        const schema = await getSchema();
        const productService = new ItemsService("product", { schema });

        if (input.payload.create_childs === true && input.payload.attribute_value?.create) {
          const parentId = input.key;
          const attributeValueService = new ItemsService("attribute_value", { schema });
          const attributes = input.payload.attribute_value.create;
          
          const sortedAttributeArray = await attributeSorter(attributes, attributeValueService);
          if (sortedAttributeArray.length === 0) {
            return input;
          }

          const combinations = combinationCreator(sortedAttributeArray);
          if (!Array.isArray(combinations)) {
            return input;
          }

          const combinationArray = Array.isArray(combinations[0]) 
            ? combinations as AttributeValueMatrix
            : [combinations] as AttributeValueMatrix;
          
          await childCreator(parentId, combinationArray);
          await productService.updateOne(parentId, { create_childs: false });
        }

        // Add attribute JSON processing
        const productData = await productService.readOne(input.key, { 
          fields: ['attribute_value.attribute_value_id.value', 'attribute_value.attribute_value_id.attribute.name'] 
        }) as Product;
        
        if (productData?.attribute_value) {
          const attributeJson: Record<string, string> = {};
          for (const attributeValue of productData.attribute_value) {
            if (attributeValue?.attribute_value_id?.attribute?.name && attributeValue.attribute_value_id.value) {
              attributeJson[attributeValue.attribute_value_id.attribute.name] = attributeValue.attribute_value_id.value;
            }
          }
          await productService.updateOne(input.key, { attributes: attributeJson });
        }
        
        return input;
      }
    },

    'product.items.update': {
      action: async (payload: UpdatePayload): Promise<void> => {
        const schema = await getSchema();
        const productService = new ItemsService('product', { schema });
        const salesChannelService = new ItemsService("sales_channel", { schema });

        if (!payload.keys.length) return;

        if (payload.payload.attribute_value) {
            const attributeJson: Record<string, string> = {};
            let productData;
            if(payload.keys[0]!=null || payload.keys[0]!=undefined){
            productData = await productService.readOne(payload.keys[0], { 
              fields: ['attribute_value.attribute_value_id.value', 'attribute_value.attribute_value_id.attribute.name'] 
            }) as Product;
          
            if (productData?.attribute_value) {
              for (const attributeValue of productData.attribute_value) {
                if (attributeValue?.attribute_value_id?.attribute?.name && attributeValue.attribute_value_id.value) {
                  attributeJson[attributeValue.attribute_value_id.attribute.name] = attributeValue.attribute_value_id.value;
                }
              }
              await productService.updateOne(payload.keys[0], { attributes: attributeJson });
            }
          } else if (payload.payload.sales_channels?.create) {
            const salesChannelKeys = payload.payload.sales_channels.create
              .map(item => item.sales_channel_id?.id)
              .filter((id): id is number => id !== undefined && id !== null);

            for (const productId of payload.keys) {
              for (const salesChannelId of salesChannelKeys) {
                try {
                  await salesChannelService.readOne(salesChannelId);
                } catch (error) {
                  console.error(`Failed to read sales channel ${salesChannelId}:`, error);
                }
              }
            }
          }
        }
        if (payload.payload.use_parent_feature === true) {
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if (product?.parent_product){
            let featureValueProductService = new ItemsService('feature_value_product', { schema });
            let featureValues = await featureValueProductService.readByQuery({ filter: { product:{_eq: product.parent_product} } });
            for (const featureValue of featureValues) {
              await featureValueProductService.createOne({ product_product_id: payload.keys[0], feature_value_id: featureValue.feature_value_id });
            }
          }
        }
        if (payload.payload.use_parent_groups === true) {
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if (product?.parent_product){
            let productGroupService = new ItemsService('product_group', { schema });
            let productGroups = await productGroupService.readByQuery({ filter: { product: {_eq:product.parent_product }} });
            for (const productGroup of productGroups) {
              await productGroupService.createOne({ product: payload.keys[0], product_group: productGroup.product_group });
            }
          }
        }
        if (payload.payload.use_parent_tags === true) {
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if (product?.parent_product){
            let productTagService = new ItemsService('product_tags', { schema });
            let productTags = await productTagService.readByQuery({ filter: { product: {_eq:product.parent_product }} });
            for (const productTag of productTags) {
              await productTagService.createOne({ product: payload.keys[0], tags: productTag.tags });
            }
          }
        }
        if (payload.payload.use_parent_sales_channel === true) {
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if (product?.parent_product){
            let salesChannelService = new ItemsService('product_sales_channel', { schema });
            let salesChannels = await salesChannelService.readByQuery({ filter: { product_product_id: {_eq:product.parent_product }} });
            for (const salesChannel of salesChannels) {
              await salesChannelService.createOne({ product_product_id: payload.keys[0], sales_channel_id: salesChannel.sales_channel_id });
            }
          }
        }
        if (payload.payload.use_parent_general === true) {
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if (product?.parent_product){
            let parentProduct = await productService.readOne(product.parent_product) as Product;
            let parentStatus = parentProduct?.status;
            let parentBackorder = parentProduct?.backorder;
            let parentDivisible = parentProduct?.divisible;

            await productService.updateOne(payload.keys[0], { status: parentStatus, backorder: parentBackorder, divisible: parentDivisible });
          }
        }
        if(payload.payload.use_parent_suppliers === true){
          console.log("should create parent suppliers for child\n\n\n")
          // check parent supplier_products 
          // create supplier products for this child that are missing
          let dataProvider = new DataProvider(database);
          let dataWriter = new DataWriter(database);
          let supplierProductService = new ItemsService('supplier_products', { schema });
          const product = await productService.readOne(payload.keys[0], { fields: ['parent_product'] }) as Product;
          if(product?.parent_product){
            let parentSuppliers = await dataProvider.getProductSuppliers(product.parent_product);
            let childSuppliers = await dataProvider.getProductSuppliers(payload.keys[0]);
            for (const parentSupplier of parentSuppliers){
              let found = false;
              for (const childSupplier of childSuppliers){
                if (parentSupplier.supplier == childSupplier.supplier){
                  found = true;
                  break;
                }
              }
              if (!found){
                console.log("creating supplier product for child")
                await supplierProductService.createOne({product:payload.keys[0], supplier:parentSupplier.supplier});
              }
            }
          }
          
        }
        if(payload.payload.status != null || payload.payload.status != undefined){
          let dataWriter = new DataWriter(database);
          await dataWriter.updateChildProductStatus(payload.keys[0], payload.payload.status);
        }
      }
    },

    'product_tags.items.create': {
      action: async ({ payload }: { payload: ProductTagPayload }): Promise<void> => {
        const schema = await getSchema();
        const productService = new ItemsService("product", { schema });
        const tagService = new ItemsService("tags", { schema });
        const productTagService = new ItemsService("product_tags", { schema });
        const product = await productService.readOne(payload.product) as Product;

        const childProducts = product?.child_products;
        if (product?.parent_product === null && Array.isArray(childProducts) && childProducts.length > 0) {
          const interval = setInterval(async function () {
            try {
              const tags = await tagService.readByQuery({ search: payload.tags.name });

              if (tags?.[0]) {
                clearInterval(interval);
                for (const childId of childProducts) {
                  if (typeof childId === 'number') {
                    await productTagService.createOne({
                      product: childId,
                      tags: tags[0],
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error processing tags:', error);
              clearInterval(interval);
            }
          }, 300);
        }
      }
    },

    'product_tags.items.delete': {
      filter: async (input: number[]): Promise<void> => {
        if (!input.length) return;

        const schema = await getSchema();
        const productTagService = new ItemsService("product_tags", { schema });
        const productService = new ItemsService("product", { schema });
        const currentTags = await productTagService.readMany(input);
        
        if (!currentTags.length) return;

        const product = await productService.readOne(currentTags[0].product) as Product;
        const childProducts = product?.child_products;

        if (product?.parent_product === null && Array.isArray(childProducts) && childProducts.length > 0) {
          for (const childId of childProducts) {
            if (typeof childId !== 'number') continue;

            for (const currentTag of currentTags) {
              if (!currentTag?.tags) continue;

              try {
                const tagForDelete = await productTagService.readByQuery({
                  filter: { product: childId, tag: currentTag.tags },
                });

                if (tagForDelete?.[0]?.id) {
                  await productTagService.deleteOne(tagForDelete[0].id);
                }
              } catch (error) {
                console.error(`Failed to delete tag for product ${childId}:`, error);
              }
            }
          }
        }
      }
    },
    'stock_replenishment_products.items.create': {
      filter: async (input: any): Promise<void> => {
        if (input.product!=null || input.product!=undefined){
          let dataProvider = new DataProvider(database);
          input.attributes = await dataProvider.getProductAttributesJson(input.product);
          }

        }
    }
  };
};

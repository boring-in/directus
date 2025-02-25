
// Interface for attribute structure
interface ProductAttribute {
  name: string;
  slug: string;
  value: string;
}

interface ProductFeatures {
  name: string;
  value: string;
}



// Interface for product JSON structure
interface ProductJson {
  externalId: string;
  parentId: string;
  name: string;
  sku: string;
  parent_sku: string;
  is_parent: boolean;
  attributes?: ProductAttribute[];
  features?:ProductFeatures[];
  salesChannelId?: string | number;
  brand?: string;
  orderedProductData?: any; // Added for getProductsForOrder method
  app_warehouse?: number; // Added during woocommerce integration, prestahsop added this separately
}

// Interface for attribute array item
interface AttributeArrayItem {
  attributeId: string | number;
  values: string[];
}

class Product {
  private ItemsService: any; // Type for Directus ItemsService
  private schema: any;
  private productService: any;
  private salesChannelProductService: any;
  private attributeService: any;
  private attributeValueService: any;
  private attributeValueProductService: any;
  private featureService: any;
  private featureValueService: any;
  private featureValueProductService: any;
  private brandService: any;
  private productSalesChannelService: any;



  constructor(ItemsService: any, schema: any) {
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.productService = new ItemsService("product", { schema: schema });
    this.salesChannelProductService = new ItemsService(
      "sales_channel_products",
      { schema: schema }
    );
    this.attributeService = new ItemsService("attributes", { schema: schema });
    this.attributeValueService = new ItemsService("attribute_value", {
      schema: schema,
    });
    this.attributeValueProductService = new ItemsService(
      "attribute_value_product",
      { schema: schema }
    );
    this.featureService = new ItemsService("features", { schema: schema });
    this.featureValueService = new ItemsService("feature_value", { schema: schema });
    this.featureValueProductService = new ItemsService("feature_value_product", { schema: schema });
    this.brandService = new ItemsService("brand", { schema: schema });
    this.productSalesChannelService = new ItemsService("product_sales_channel", { schema: schema });
  }

  async getAllChildProductAttributes(parentId: string | number): Promise<AttributeArrayItem[]> {
    const query = {
      query: `
        SELECT DISTINCT
          a.id as attributeId,
          JSON_AGG(DISTINCT av.value) as values
        FROM product p
        JOIN attribute_value_product avp ON p.product_id = avp.product_product_id
        JOIN attribute_value av ON avp.attribute_value_id = av.id
        JOIN attributes a ON av.attribute = a.id
        WHERE p.parent_product = ?
        GROUP BY a.id
      `,
      bindings: [parentId]
    };

    const results = await this.ItemsService.database.raw(query.query, query.bindings);
    
    return results.map((row: any) => ({
      attributeId: row.attributeId,
      values: row.values
    }));
  }

  async getProductById(id: string | number): Promise<any> {
    let product = await this.productService.readByQuery({ filter: { product_id: id } });
    return product[0];
  }

  async getSalesChannelProduct(productJson: ProductJson, salesChannelId: string | number): Promise<any> {
    let salesChannelProduct;
    let salesChannelProductData =
      await this.salesChannelProductService.readByQuery({
        filter: {
          _and: [
            { sales_channel: salesChannelId },
            { sales_channel_product_id: productJson.externalId },
          ],
        },
      });
    if (salesChannelProductData.length == 0) {
      let mainProduct = await this.getProductBySku(productJson);
      salesChannelProduct = await this.createSalesChannelProduct(
        productJson.externalId,
        mainProduct,
        salesChannelId
      );
    } else {
      salesChannelProduct = salesChannelProductData[0];
    }

    return salesChannelProduct;
  }

  async createSalesChannelProduct(
    externalId: string,
    mainProduct: any,
    salesChannelId: string | number
  ): Promise<any> {
    let salesChannelProductId = await this.salesChannelProductService.createOne(
      {
        sales_channel: salesChannelId,
        sales_channel_product_name: mainProduct.name,
        sales_channel_product_id: externalId,
        product: mainProduct.product_id,
        product_status: 0,
      }
    );
    return {
      id: salesChannelProductId,
      sales_channel: salesChannelId,
      sales_channel_product_name: mainProduct.name,
      sales_channel_product_id: externalId,
      product: mainProduct.product_id,
      product_status: 0,
    };
  }

  async createProduct(productJson: ProductJson): Promise<any> {
    let testProductService = new this.ItemsService("product", { schema: this.schema });
    let finalProduct;
    if (productJson.externalId == productJson.parentId) {
      //create main products without parent
      let brandId = null;
      if(productJson.brand != undefined){
        let brandData = await this.brandService.readByQuery({filter: {name: {_eq:productJson.brand}}});
        if(brandData.length == 0){
          brandId = await this.brandService.createOne({name: productJson.brand});
        }
        else{
          brandId = brandData[0].id;
      }
    }
      
    
      let mainProduct = await this.productService.createOne({
        name: productJson.name,
        product_type: 0,
        status: 0,
        sku: productJson.sku,
        brand: brandId,
        is_parent: productJson.is_parent,
      });
      if(productJson.salesChannelId != undefined){
        await this.productSalesChannelService.createOne({product_product_id: mainProduct, sales_channel_id: productJson.salesChannelId});
      }


      if(productJson.attributes != undefined){
        await this.createAttributes(mainProduct, productJson.attributes);
      }
      if(productJson.features != undefined){
        await this.createFeatures(mainProduct, productJson.features);
      }

      finalProduct = {
        product_id: mainProduct,
        name: productJson.name,
        product_type: 0,
        status: 0,
        sku: productJson.sku,
        brand: brandId,
        is_parent : productJson.is_parent,
      };
    } else {
      //create parent product -- first check if parent already exists 
      let parentProductData = await this.productService.readByQuery({filter:{sku:{_eq: productJson.parent_sku}}});
      let parentProductId;
      if(parentProductData.length == 0){
        try{
          parentProductId = await testProductService.createOne({
            name: productJson.name,
            product_type: 0,
            status: 0,
            sku: productJson.parent_sku,
            is_parent: productJson.is_parent,
          });
        }
        catch(err){
          console.log(err);
          throw new Error("Parent product creation failed");
        }
      }
      else{
        parentProductId = parentProductData[0].product_id;
      }
      let childProductId = await this.productService.createOne({
        name: productJson.name,
        product_type: 0, 
        status: 0,
        sku: productJson.sku,
        parent_product: parentProductId,
        is_parent: productJson.is_parent,
      });
      if(productJson.salesChannelId != undefined){
        await this.productSalesChannelService.createOne({product_product_id: childProductId, sales_channel_id: productJson.salesChannelId});
      }
      if(productJson.attributes != undefined){
        await this.createAttributes(childProductId, productJson.attributes);
      }
      finalProduct = {
        product_id: childProductId,
        name: productJson.name,
        product_type: 0,
        status: 0,
        sku: productJson.sku,
        parent_product: parentProductId,
        is_parent: productJson.is_parent,
      };
    }
    return finalProduct;
  }

  async getProductBySku(productJson: ProductJson): Promise<any> {
    if(productJson.sku != null && productJson.sku.trim().length > 0){
      let product;
      let productData;
      try{
        productData = await this.productService.readByQuery({
          filter: { sku: {_eq: productJson.sku} },
        });
      }
      catch(err){
        console.log(err);
      }
      if (productData.length == 0) {
        product = await this.createProduct(productJson);
      } else {
        product = productData[0];
      }
      return product;
    }
  }

  async getProductsForOrder(salesChannelId: string | number, productJsonArray: ProductJson[]): Promise<ProductJson[]> {
    for (let i = 0; i < productJsonArray.length; i++) {
      let productJson = productJsonArray[i];
     
      let orderedProduct = await this.getSalesChannelProduct(
         //@ts-ignore
        productJson,
        salesChannelId
      );
     //@ts-ignore
      productJsonArray[i].orderedProductData = orderedProduct;
    }
    return productJsonArray;
  }

  async createAttributes(productId: string | number, attributeArray: ProductAttribute[] | string): Promise<void> {
    if (!attributeArray) {
      return;
    }

    let attributes: ProductAttribute[];
    if (typeof attributeArray === "string") {
      const parsedString = JSON.parse(attributeArray);
      attributes = parsedString.attributes;
    } else {
      attributes = attributeArray;
    }

    for (const attributeData of attributes) {
      const attribute = await this.getAttribute(attributeData);
      const attributeValue = await this.getAttributeValue(
        attribute,
        attributeData.value
      );
      await this.getAttributeValueProduct(attributeValue, productId);
    }
  }

  async getAttribute(attribute: ProductAttribute): Promise<string | number> {
    let attributeData = await this.attributeService.readByQuery({
      filter: { reference: attribute.slug },
    });
    let attributeId;
    if (attributeData.length == 0) {
      attributeId = await this.attributeService.createOne({
        name: attribute.name,
        reference: attribute.slug,
      });
    } else {
      attributeId = attributeData[0].id;
    }

    return attributeId;
  }

  async getAttributeValue(attribute: string | number, value: string): Promise<string | number> {
    let attributeValueData = await this.attributeValueService.readByQuery({
      filter: {
        _and: [{ attribute: attribute }, { value: value }],
      },
    });
    let attributeValue;
    if (attributeValueData.length == 0) {
      attributeValue = await this.attributeValueService.createOne({
        attribute: attribute,
        value: value,
      });
    } else {
      attributeValue = attributeValueData[0].id;
    }
    return attributeValue;
  }

  async getAttributeValueProduct(attributeValue: string | number, productId: string | number): Promise<void> {
    await this.attributeValueProductService.createOne({
      attribute_value_id: attributeValue,
      product_product_id: productId,
    });
  }

  async createFeatures(productId: string | number, featureArray: ProductFeatures[]): Promise<void> {
    if (featureArray != undefined && featureArray != null) {
      for (let featureData of featureArray) {
        // Get or create feature
        let feature = await this.getFeature(featureData.name);
        
        // Get or create feature value
        let featureValue = await this.getFeatureValue(feature, featureData.value);
        
        // Map feature value to product
        await this.mapFeatureValueToProduct(featureValue, productId);
      }
    }
  }

  private async getFeature(name: string): Promise<string | number> {
    let featureData = await this.featureService.readByQuery({
      filter: { name: { _eq: name } }
    });

    if (featureData.length == 0) {
      return await this.featureService.createOne({
        name: name
      });
    }
    return featureData[0].id;
  }

  private async getFeatureValue(feature: string | number, value: string): Promise<string | number> {
    console.log("FEATURE VALUE DATA", feature, value);
    let featureValueData = await this.featureValueService.readByQuery({
      filter: {
        _and: [
          { feature: { _eq: feature } },
          { value: { _eq: value } }
        ]
      }
    });

    if (featureValueData.length == 0) {
      return await this.featureValueService.createOne({
        feature: feature,
        value: value
      });
    }
    return featureValueData[0].id;
  }

  private async mapFeatureValueToProduct(featureValue: string | number, productId: string | number): Promise<void> {
    // Check if mapping already exists
    const existingMapping = await this.featureValueProductService.readByQuery({
      filter: {
        _and: [
          { feature_value_id: { _eq: featureValue } },
          { product_product_id: { _eq: productId } }
        ]
      }
    });

    if (existingMapping.length === 0) {
      await this.featureValueProductService.createOne({
        feature_value_id: featureValue,
        product_product_id: productId
      });
    }
  }

}

export default Product;



class Product{

constructor(ItemsService,schema){
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.productService = new ItemsService("product",{schema:schema});
    this.salesChannelProductService = new ItemsService("sales_channel_products",{schema:schema});
    this.attributeService = new ItemsService("attributes",{schema:schema});
    this.attributeValueService = new ItemsService("attribute_value",{schema:schema});
    this.attributeValueProductService = new ItemsService("attribute_value_product",{schema:schema});

};


getProductById(){

}

async getSalesChannelProduct(productJson,salesChannelId){
   
   
    let salesChannelProduct;
    let salesChannelProductData = await this.salesChannelProductService.readByQuery({filter:{_and:
    [{sales_channel:salesChannelId},{sales_channel_product_id:productJson.externalId}]}});
    if(salesChannelProductData.length == 0){
        let mainProduct = await this.getProductBySku(productJson);
        salesChannelProduct = await this.createSalesChannelProduct(productJson.externalId,mainProduct,salesChannelId);
    }
    else{
        salesChannelProduct = salesChannelProductData[0];
    }

    return salesChannelProduct;


}

async createSalesChannelProduct(externalId,mainProduct,salesChannelId){
    let salesChannelProductId = await this.salesChannelProductService.createOne({
        sales_channel : salesChannelId,
        sales_channel_product_name:mainProduct.name,
        sales_channel_product_id:externalId,
        product:mainProduct.product_id,
        product_status:0
    });
    return {id:salesChannelProductId,
        sales_channel : salesChannelId,
        sales_channel_product_name:mainProduct.name,
        sales_channel_product_id:externalId,
        product:mainProduct.product_id,
        product_status:0}

}

async createProduct(productJson){
    let finalProduct;
    if(productJson.externalId == productJson.parentId){
        //create main products without parent
        let mainProduct = await this.productService.createOne({
            name:productJson.name,
            product_type:0, //TODO add services and downloadale products
            status: 0,
            sku:productJson.sku

        });

        await this.createAttributes(mainProduct,productJson.attributes);
        finalProduct = {
            product_id:mainProduct,
            name:productJson.name,
            product_type:0, //TODO add services and downloadale products
            status: 0,
            sku:productJson.sku

        };
    }
    else{
        //create parent product 
        let parentProductId = await this.productService.createOne({ name:productJson.name,
            product_type:0, //TODO add services and downloadale products
            status: 0,
            sku:productJson.sku});
        let childProductId = await this.productService.createOne({ name:productJson.name,
            product_type:0, //TODO add services and downloadale products
            status: 0,
            sku:productJson.sku,
            parent_product:parentProductId
            });
            await this.createAttributes(childProductId,productJson.attributes);
            finalProduct ={  
                product_id:childProductId,
                name:productJson.name,
                product_type:0, //TODO add services and downloadale products
                status: 0,
                sku:productJson.sku,
                parent_product:parentProductId};
    }
    return finalProduct;
    
}

async getProductBySku(productJson){
    let product;
    let productData = await this.productService.readByQuery({filter:{sku:productJson.sku}});
    if(productData.length == 0){
         product = await this.createProduct(productJson);
    }
    else{
        product = productData[0];
    }
    return product;
}

 async getProductsForOrder(salesChannelId,productJsonArray){
    for(let i = 0 ; i < productJsonArray.length; i++){
        let productJson = productJsonArray[i];
        let orderedProduct = await this.getSalesChannelProduct(productJson,salesChannelId);
        console.log(orderedProduct)
        productJsonArray[i].orderedProductData =orderedProduct;

    }
    return productJsonArray;

}

async createAttributes(productId,attributeArray){
    for(let i = 0 ; i<attributeArray.length ; i++){
        let attributeData = attributeArray[i];
        let attribute = await this.getAttribute(attributeData);
        let attributeValue = await this.getAttributeValue(attribute,attributeData.value);
        await this.getAttributeValueProduct(attributeValue, productId);
    }
}

async getAttribute(attribute){
    let attributeData = await this.attributeService.readByQuery({filter:{slug:attribute.slug}});
    let attributeId;
    if(attributeData.length ==0){
         attributeId = await this.attributeService.createOne({name:attribute.name,slug:attribute.slug});
    }
    else{
        attributeId = attributeData.id;
    }

    return attributeId;
    
}

async getAttributeValue(attribute,value){
    let attributeValueData = await this.attributeValueService.readByQuery({filter:{
        _and:[{attribute:attribute},{value:value}]
    }});
    let attributeValue;
    if(attributeValueData.length == 0){
        attributeValue = await this.attributeValueService.createOne({attribute:attribute,value:value});
    }
    else{
        attributeValue = attributeValueData[0].id;
    }
    return attributeValue;
}

async getAttributeValueProduct(attributeValue,productId){
    await this.attributeValueProductService.createOne({attribute_value_id:attributeValue,product_product_id:productId});
}


}
export default Product;
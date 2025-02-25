export const setupProductHooks = ({ services, getSchema }) => {
  const { ItemsService } = services;

  async function childCreator(parentId, combinationArray) {
    let productService = new ItemsService('product', { schema: await getSchema() });
    let attributeService = new ItemsService('attributes', { schema: await getSchema() });
    let attributeValueProductService = new ItemsService('attribute_value_product', { schema: await getSchema() });
    let parent = await productService.readOne(parentId, { fields: ["*"] });

    for (let i = 0; i < combinationArray.length; i++) {
      let combination = combinationArray[i];
      let newChild = await productService.createOne({ name: parent.name, parent_product: parent.product_id, sku: "tempSku" });
      let skuString = parent.sku + "/";

      for (let x = 0; x < combination.length; x++) {
        await attributeValueProductService.createOne({ attribute_value_id: combination[x].id, product_product_id: newChild });
        let attribute = await attributeService.readOne(combination[x].attribute);
        let valueRef = combination[x].reference;
        let attributeRef = attribute.reference;
        
        if (valueRef == null) {
          valueRef = combination[x].value.toUpperCase();
        }
        if (attributeRef == null) {
          attributeRef = attribute.name.toUpperCase();
        }
        let refString = attributeRef + valueRef;
        skuString += refString + "_";
      }
      await productService.updateOne(newChild, { sku: skuString });
    }
  }

  function combinationCreator(array) {
    if (array.length > 1) {
      let result = [];
      let otherComb = combinationCreator(array.slice(1));
      for (let i = 0; i < array[0].length; i++) {
        for (let x = 0; x < otherComb.length; x++) {
          result.push([array[0][i], otherComb[x]]);
        }
      }
      return result;
    } else return array[0];
  }

  async function attributeSorter(array, attributeService) {
    let sortedArray = [];

    for (let i = 0; i < array.length; i++) {
      let attribute_value = array[i];
      let attribute = await attributeService.readOne(attribute_value.attribute_value_id.id);
      let found = false;

      if (sortedArray.length > 0) {
        sortedArray.forEach((item) => {
          if (item[0].attribute == attribute.attribute) {
            item.push(attribute);
            found = true;
          }
        });
        if (found == false) {
          let newArray = [];
          newArray.push(attribute);
          sortedArray.push(newArray);
        }
      }
      if (sortedArray.length == 0) {
        let newArray = [];
        newArray.push(attribute);
        sortedArray.push(newArray);
      }
    }
    return sortedArray;
  }

  return {
    'product.items.create': {
      action: async (input) => {
        if (input.payload.create_childs == true) {
          let parentId = input.key;
          let schema = await getSchema();
          let attributeValueService = new ItemsService("attribute_value", { schema });
          let productService = new ItemsService("product", { schema });
          let attributes = input.payload.attribute_value.create;
          let sortedAttributeArray = await attributeSorter(attributes, attributeValueService);
          let combinationArray = combinationCreator(sortedAttributeArray);
          
          for (let i = 0; i < combinationArray.length; i++) {
            let combination = combinationArray[i];
            let flattened = combination.flat(Infinity);
            combinationArray[i] = flattened;
          }
          
          await childCreator(parentId, combinationArray);
          await productService.updateOne(parentId, { create_childs: false });
        }
        return input;
      }
    },

    'product.items.update': {
      action: async (payload) => {
        let schema = await getSchema();
        let productService = new ItemsService('product', { schema });
        let salesChannelService = new ItemsService("sales_channel", { schema });

        if (payload.payload.attribute_value) {
          let attributeJsonArray = [];
          let productData = await productService.readOne(payload.keys[0], { fields: ['attribute_value.attribute_value_id.value', 'attribute_value.attribute_value_id.attribute.name'] });
          let attributeValueData = productData.attribute_value;

          for (let i = 0; i < attributeValueData.length; i++) {
            let attributeValue = attributeValueData[i].attribute_value_id;
            let jsonItem = { [attributeValue.attribute.name]: attributeValue.value };
            attributeJsonArray.push(jsonItem);
          }
          await productService.updateOne(payload.keys[0], { attributes: attributeJsonArray });
        } else if (payload.payload.sales_channels) {
          let keys = payload.keys;
          let salesChannelKeys = [];
          payload.payload.sales_channels.create.forEach(item => salesChannelKeys.push(item.sales_channel_id.id));

          for (let i = 0; i < keys.length; i++) {
            let productId = keys[i];
            for (let x = 0; x < salesChannelKeys.length; x++) {
              let salesChannelId = salesChannelKeys[x];
              let salesChannel = await salesChannelService.readOne(salesChannelId);
            }
          }
        }
      }
    },

    'product_tags.items.create': {
      action: async ({ payload }) => {
        let schema = await getSchema();
        let productService = new ItemsService("product", { schema });
        let tagService = new ItemsService("tags", { schema });
        let productTagService = new ItemsService("product_tags", { schema });
        let product = await productService.readOne(payload.product);

        if (product.parent_product == null) {
          setInterval(async function () {
            let tags = await tagService.readByQuery({ search: payload.tags.name });

            if (tags[0]) {
              clearInterval(this);
              let childProductIds = product.child_products;

              for (let i = 0; i < childProductIds.length; i++) {
                await productTagService.createOne({
                  product: childProductIds[i],
                  tags: tags[0],
                });
              }
            }
          }, 300);
        }
      }
    },

    'product_tags.items.delete': {
      filter: async (input, { keys, collection }) => {
        let schema = await getSchema();
        let productTagService = new ItemsService("product_tags", { schema });
        let productService = new ItemsService("product", { schema });
        let currentTags = await productTagService.readMany(input);
        let product = await productService.readOne(currentTags[0].product);

        if (product.parent_product == null) {
          let childProductIds = product.child_products;
          for (let i = 0; i < childProductIds.length; i++) {
            for (let x = 0; x < currentTags.length; x++) {
              let tagForDelete = await productTagService.readByQuery({
                filter: { product: childProductIds[i], tag: currentTags[x].tags },
              });
              if (tagForDelete[0]) {
                await productTagService.deleteOne(tagForDelete[0].id);
              }
            }
          }
        }
      }
    }
  };
};

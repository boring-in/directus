export const setupSupplierHooks = ({ services, getSchema }) => {
  const { ItemsService } = services;

  return {
    'supplier.items.update': {
      action: async (payload) => {
        if (payload.payload.supplier_products) {
          let schema = await getSchema();
          let productService = new ItemsService('product', { schema });
          let supplierProductService = new ItemsService('supplier_products', { schema });
          let productPriceService = new ItemsService('product_price', { schema });
          let createdSupplierProducts = payload.payload.supplier_products.create;

          for (let i = 0; i < createdSupplierProducts.length; i++) {
            let item = createdSupplierProducts[i].product;
            let product = await productService.readOne(item, { fields: ["child_products"] });

            if (product.child_products.length > 0) {
              let parentSupplierProduct = await supplierProductService.readByQuery({
                filter: {
                  _and: [
                    { supplier: { _eq: payload.keys[0] } },
                    { product: { _eq: item } }
                  ]
                }
              }, { fields: ["product_price.*.*", "delivery_term"] });

              for (let x = 0; x < product.child_products.length; x++) {
                let childProductId = product.child_products[x];
                let newProduct = await supplierProductService.createOne({
                  supplier: payload.keys[0],
                  product: childProductId,
                  delivery_term: parentSupplierProduct[0].delivery_term
                });

                for (let y = 0; y < parentSupplierProduct[0].product_price.length; y++) {
                  let parentPrice = await productPriceService.readOne(parentSupplierProduct[0].product_price[y]);
                  await productPriceService.createOne({
                    supplier_products: newProduct,
                    price: parentPrice.price,
                    quantity_in_package: parentPrice.quantity_in_package,
                    package_MOQ: parentPrice.package_MOQ,
                    MOQ_delivery_time: parentPrice.MOQ_delivery_time
                  });
                }
              }
            }
          }
        }
      }
    },

    'warehouse_products.items.create': {
      filter: async (input) => {
        let schema = await getSchema();
        let stockService = new ItemsService("stock", { schema });
        let existingStock = await stockService.readByQuery({
          filter: {
            _and: [
              { warehouse: { _eq: input.warehouse } },
              { product: { _eq: input.product } }
            ]
          }
        });

        if (existingStock.length == 0) {
          await stockService.createOne({
            warehouse: input.warehouse,
            product: input.product,
            onhand_quantity: 0,
            available_quantity: 0,
            ordered_quantity: 0,
            reserved_quantity: 0
          });
        }
        return input;
      }
    }
  };
};



import DataProvider from "../../class/DataProvider";

class Barcode {
  static async getProduct(
    barcode: string, 
    warehouse: number, 
    supplier: number, 
    context: any
  ): Promise<any> {
    const dataProvider = new DataProvider(context);
    const product = await dataProvider.getProductDataByBarcode(barcode, warehouse, supplier);
    return product;
  }
}

export default Barcode;
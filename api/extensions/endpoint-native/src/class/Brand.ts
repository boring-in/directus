;

class Brand {
    private ItemsService: any;
    private schema: any;
    private brandService: any;

    constructor(ItemsService:any, schema:any) {
        this.ItemsService = ItemsService;
        this.schema = schema;
        this.brandService = new ItemsService("brand", { schema: schema });
    }

    public async getBrand(name:string){
        let brand = this.brandService.readByQuery({filter: {name: {_eq: name}}});
        if (brand && brand.length > 0) {
            return brand[0];
        }
        else{
           brand = await this.createBrand(name);
        }
        return brand;

    }

    public async createBrand(name:string){
       let brandId = await this.brandService.createOne({name: name});
       return {id: brandId, name: name};
    }

    

    
}
export default Brand;
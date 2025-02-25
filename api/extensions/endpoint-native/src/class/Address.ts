import Country from "./Country";

class Address {
  country: string;
  city: string;
  address: string;
  postcode: string;
  phone: string;
  mobile: string;
  ItemsService: any;
  schema: any;
  addressService: any;

  constructor(
    country: string, 
    city: string, 
    address: string, 
    postcode: string, 
    phone: string, 
    mobile: string, 
    ItemsService: any, 
    schema: any
  ) {
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;
    this.phone = phone;
    this.mobile = mobile;
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.addressService = new ItemsService("address", { schema: schema });
  }

  async getAddress(customerId: number): Promise<any> {
    console.log("Address iso code: " + this.country)
    let address: any;

    let countryData = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );

    let addressData = await this.addressService.readByQuery({
      filter: {
        _and: [
          { country: countryData.id },
          { city: this.city },
          { address: this.address },
          { zip_postal_code: this.postcode },
          { customer: Number(customerId) },
        ],
      },
    });

    if (addressData.length == 0) {
      address = await this.createAddress(customerId);
      console.log("if address 41")
      console.log(address)
    } else {
      address = addressData[0];
    }
   
    return address;
  }

  async createAddress(customer: number): Promise<any> {
    console.log("create address 52")
    console.log(this.phone + " " + this.mobile)
    
    let country = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );
    
    let newAddressId = await this.addressService.createOne({
      country: country,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
      phone: this.phone,
      mobile_phone: this.mobile,
      customer: customer,
    });
    
    return {
      country: country.id,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
      id: newAddressId,
      customer: customer,
    };
  }
}

export default Address;
import Address from "./Address";
import Country from "./Country";

class Customer {
  salesChannelId: number;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  city: string;
  address: string;
  postcode: string;
  phone_mobile: string;
  phone: string;
  customer_phone: string;

  customerService: any;
  ItemsService: any;
  schema: any;

  constructor(
    salesChannelId: number,
    firstName: string,
    lastName: string,
    email: string,
    country: string,
    city: string,
    address: string,
    postcode: string,
    phone_mobile: string,
    phone: string,
    customer_phone: string,
    ItemsService: any,
    schema: any
  ) {
    this.salesChannelId = salesChannelId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;
    this.phone_mobile = phone_mobile;
    this.phone = phone;
    this.customer_phone = customer_phone;

    this.customerService = new ItemsService("customers", { schema: schema });
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async getCustomer(): Promise<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    sales_channel: number;
    parent_customer?: number;
    phone: string;
    phone_mobile: string;
  }> {
    console.log("Customer iso code: " + this.country)
    let countryData = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );
   // console.log("Country data: " + countryData)

    let adr = new Address(
      countryData.country_code,
      this.city,
      this.address,
      this.postcode,
      this.phone,
      this.phone_mobile,
      this.ItemsService,
      this.schema
    );

    let customerData = await this.customerService.readByQuery({
      filter: { email: this.email },
    });
    
    let customer: {
      id: number;
      email: string;
      first_name: string;
      last_name: string;
      sales_channel: number;
      parent_customer?: number;
      phone: string;
      phone_mobile: string;
    };

    if (customerData.length == 0) {
      let parentCustomer = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName
      });
      
      let customerId = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        parent_customer: parentCustomer,
        phone: this.customer_phone,
      });
      
      await adr.getAddress(customerId);

      customer = {
        id: customerId,
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        parent_customer: parentCustomer,
        phone: this.phone,
        phone_mobile: this.phone_mobile,
      };
    } else {
      let foundCustomer = customerData.find(
        (item: any) => item.sales_channel == this.salesChannelId
      );
      
      if (foundCustomer == undefined) {
        let parentCustomer = customerData.find(
          (item: any) => item.parent_customer == null
        );
        
        let customerId = await this.customerService.createOne({
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          parent_customer: parentCustomer.id,
          phone: this.customer_phone,
        });
        
        await adr.getAddress(customerId);
        
        customer = {
          id: customerId,
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          parent_customer: parentCustomer.id,
          phone: this.phone,
          phone_mobile: this.phone_mobile,
        };
      } else {
        customer = foundCustomer;
        await adr.getAddress(foundCustomer.id)
      }
    }
    
    return customer;
  }
}

export default Customer;
<template>
	<v-input v-model="value" :value="value" @input="handleChange($event.target.value)" />
	<v-button class="import_groups" @click="importGroups(value)">import groups</v-button>
	<v-button class="import_products" @click="importProducts(value)">import products</v-button>
	<v-button class="import_orders" @click="importOrders(value)">import orders</v-button>
	<!-- <v-button @click="showCartEngine">cartEnginetest</v-button> -->
</template>

<script>
export default {
	props: {
		value: {
			type: String,
			default: null,
		},
	},
	emits: ['input'],
	inject: ['api','Buffer'],
	methods : {
	
		importOrders: function(value){
			let cartEngineDiv = document.querySelector('div[field="cart_engine"]');
			let cartEngine = cartEngineDiv.querySelector('input')._value;
			
			if(cartEngine=="PrestaShop 1.5"){
				let domainFull = document.querySelectorAll('input[field="domain_name"]')[0]._value;
			//let domainEncoded = this.Buffer.from(domainFull).toString('base64');
			let domainSplit = domainFull.split(".");
			let domainName = domainSplit[0];
			let domainSuffix = domainSplit[1]
			let consumerKey = value;
			let consumerSecret = document.querySelectorAll('input[field="secret_key"]')[0]._value;
			let url = window.location.href;
			let urlSplit = url.split("/");
			let salesChannelId = urlSplit[urlSplit.length - 1];
			this.api.get(`/prestashop/get_orders/${domainFull}/${consumerKey}/${salesChannelId}`).then((res)=> console.log(res)).catch((err) => console.log(err));			}
			else{
				alert("order import only works with Prestashop 1.5");
			}
		},
		importGroups: function(value){
			let cartEngineDiv = document.querySelector('div[field="cart_engine"]');
			let cartEngine = cartEngineDiv.querySelector('input')._value;
			if(cartEngine!="WooComerce"){
				alert("Groups import works only with WooComerce right now");
			}
			else{
			let domainFull = document.querySelectorAll('input[field="domain_name"]')[0]._value;
			let domainSplit = domainFull.split(".");
			let domainName = domainSplit[0];
			let domainSuffix = domainSplit[1]
			let consumerKey = value;
			let consumerSecret = document.querySelectorAll('input[field="secret_key"]')[0]._value;
			this.api.get(`/get_wp_product_groups/${domainName}/${domainSuffix}/${consumerKey}/${consumerSecret}`).then((res) => console.log(res)).catch((err) => console.log(err))
			}
		},
		importProducts: function(value){
			let cartEngineDiv = document.querySelector('div[field="cart_engine"]');
			let cartEngine = cartEngineDiv.querySelector('input')._value
			
			let domainFull = document.querySelectorAll('input[field="domain_name"]')[0]._value;
			//let domainEncoded = this.Buffer.from(domainFull).toString('base64');
			let domainSplit = domainFull.split(".");
			let domainName = domainSplit[0];
			let domainSuffix = domainSplit[1]
			let consumerKey = value;
			let consumerSecret = document.querySelectorAll('input[field="secret_key"]')[0]._value;
			let url = window.location.href;
			let urlSplit = url.split("/");
			let salesChannelId = urlSplit[urlSplit.length - 1];
			switch (cartEngine){
				case "PrestaShop 1.5":{
					this.api.get(`/prestashop/get_products/${domainFull}/${consumerKey}/${salesChannelId}`).then((res)=> console.log(res)).catch((err) => console.log(err));
					break;
				}
				case "WooComerce":{
					this.api.get(`/native/woocommerce/sync_products_downstream/${salesChannelId}`).then((res) => console.log(res)).catch((err) => console.log(err));
					break;
				}
				default:{
					break;
				}
			}
			
		}
	},
	setup(props, { emit }) {
		return { handleChange };

		function handleChange(value) {
			emit('input', value);
		}
	},
};
</script>

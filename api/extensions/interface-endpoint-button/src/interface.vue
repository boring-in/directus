<template>
	<v-button v-on:click="main()">{{ buttonLabel }}</v-button>	
</template>

<script>
import axios from 'axios';
export default {
	props: {
		endpoint: {
			type: String,
			default: null,
		},
		params: {
			type: String,
			default: null,
		},
		auth: {
			type: String,
			default: null,
		},
		buttonLabel:{
			type: String,
			default: null,
		},
		redirect:{
			type: Boolean,
			default: false,
		},
		redirectWithData:{
			type: Boolean,
			default: false,
		},
		redirectUrl:{
			type: String,
			default: null,
		}
		
	},
	emits: ['input'],
	methods:{
		main: async function(){
			let data = await this.callEndpoint();
			if(this.redirect == true){
				console.log("redirect");
				if(this.redirectWithData == true){
					this.redirectFunc(this.redirectUrl+data);
				}
				else{
					this.redirectFunc(this.redirectUrl);
				}
				
			}
		},
		createEndpoint: function(){
			console.log(this.params)
			let paramsSplit = this.params.split("/");
			console.log(paramsSplit)
			for (let i = 0; i < paramsSplit.length; i++) {
				if (paramsSplit[i].includes("$THIS_ITEM")) {
					let param = window.location.pathname.split("/").pop()
					console.log(param)
					paramsSplit[i] =param;
				}
			}
			let newParams = paramsSplit.join("/");
			console.log(newParams);
			return this.endpoint + newParams;
		},
		callEndpoint:async function(){
			let endpointData;
			let endpoint = this.createEndpoint();
			if(this.auth != null){
				endpointData = await axios.get(endpoint, {
					headers: {
						'Bearer': this.auth
					}
				});
			}
			else{
				endpointData = await axios.get(endpoint);
			}
			console.log(endpointData);
			return endpointData.data.data;
		},
		redirectFunc: function(url){
			window.location.href = url;
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

<template>
  <div class="import-main">
      <input class="import-input" :value="value" @input="handleChange($event.target.value)" />

    <label class="import-fields-label" for="import-fields">
      {{ importFieldsLabel }}
    </label>
    <div class="import-fields" id="import-fields">
      <v-input v-model="year" id="year" :value="year" :placeholder="yearInputPlaceholder"/>
      <div class="import-button">
        <v-button v-on:submit.prevent v-on:click="importHolidays(value)">{{ buttonLabel }}</v-button>
        <p class="notice">{{notice}}</p>
      </div>
    </div>

  </div>
</template>

<script>
export default {
	props: {
		value: {
			type: String,
			default: null,
		},
    notice:{
      type: String,
      default: "only missing dates will be imported"
    },
    buttonLabel:{
      type: String,
      default: "Import Holidays"
    },
    yearInputPlaceholder:{
      type: String,
      default: "Enter year"
    },
    importFieldsLabel:{
      type: String,
      default: "Public holidays import"
    },
    year:{
      type:Number,
      default:null
    }

	},


	emits: ['input'],
  inject:['api'],
  methods:{
    importHolidays: function(value){
     
      console.log(this.year);
      if(this.year<=0||this.year==null){
        this.api.get(`/native/public_holidays/${value}`);
      }
      else{
      this.api.get(`/native/public_holidays_by_year/${value}/${this.year}`);
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
<style>
.import-input {
  /*flex-grow: 1;*/
  width: 100%;
  height: 100%;
  padding: 16px;
  margin-bottom: 32px;
  background-color: transparent;
  appearance: none;
  border:  2px solid #d3dae4;
  border-radius: 6px;
}
/* #year{
  width: 150px;
  background-color: transparent;
  appearance: none;
  border:  2px solid #d3dae4;
  border-radius: 6px;
  margin-top: 16px;
  margin-bottom: 16px;
  padding-left: 16px;
  padding-right: 16px;
} */
button{
  margin-top: 16px;
  margin-bottom: 16px;
  height: 100%;

}
.import-main{
  display: flex;
  flex-direction: column;
}
.import-fields{
  display: flex;
  /*flex-direction: column;*/

}
.import-fields-label{
  font-size: 16px;
  font-style: normal;
  font-weight: 600;
  line-height: 19px;
}
.import-button{
  display: flex;
  flex-direction: row;
  margin-left: 32px;
}
.notice{
  align-self: center;
  margin-left: 16px;
}

</style>

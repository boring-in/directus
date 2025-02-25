<template>
	<!-- No visible elements needed -->
  </template>
  
  <script>
  import { onMounted, onUnmounted, ref } from 'vue';
  
  export default {
	props: {
	  value: {
		type: String,
		default: null,
	  },
	  selectorClassPairs: {
		type: Array,
		default: () => [],
	  },
	  classesToRemove: {
		type: String,
		default: '',
	  },
	},
	setup(props) {
	  const observer = ref(null);
  
	  function updateClasses() {

		// Remove specified classes
		if (props.classesToRemove) {
		  const classesToRemove = props.classesToRemove.split(' ').map(cls => cls.trim());
		  classesToRemove.forEach(cls => {
			const elements = document.querySelectorAll(`.${cls}`);
			elements.forEach(element => {
			  
			  element.classList.remove(cls);
			});
		  });
		}
  
		// Add classes and set up observers
		props.selectorClassPairs.forEach((pair, index) => {
		
  
		  let elements = document.querySelectorAll(pair.selector);
		 
		  elements.forEach(element => {
			if (pair.classToAdd) {
			
			  const classesToAdd = pair.classToAdd.split(' ').map(cls => cls.trim());
			  
			  // Use MutationObserver to ensure class stays added
			  const observer = new MutationObserver(() => {
				classesToAdd.forEach(cls => {
				  if (!element.classList.contains(cls)) {
					element.classList.add(cls);
				  }
				});
			  });
  
			  observer.observe(element, { attributes: true, attributeFilter: ['class'] });
  
			  // Store the observer for cleanup
			  if (!observer.value) observer.value = [];
			  observer.value.push(observer);
  
			  // Initial class addition
			  classesToAdd.forEach(cls => element.classList.add(cls));
			}
		  });
		});
  
		
	  }
  
	  onMounted(() => {
		
		updateClasses();
  
		// Add a style tag to increase specificity
		const style = document.createElement('style');
		style.innerHTML = props.selectorClassPairs.map(pair => 
		  `${pair.selector}.${pair.classToAdd.split(' ').join('.')} { /* Your styles here */ }`
		).join('\n');
		document.head.appendChild(style);
	  });
  
	  onUnmounted(() => {
		// Clean up observers
		if (observer.value) {
		  observer.value.forEach(obs => obs.disconnect());
		}
	  });
  
	  return {
		updateClasses,
	  };
	},
  };
  </script>
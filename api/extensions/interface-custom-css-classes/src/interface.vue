<template>
	<!-- No visible elements needed -->
  </template>
  
  <script>
  /**
   * Custom CSS Class Adder Interface
   * This component dynamically manages CSS classes on DOM elements based on configured selectors.
   * It supports both adding new classes and removing existing ones, maintaining the changes even when classes are modified elsewhere.
   */
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
	},
	setup(props) {
	  const observers = ref([]);
  
	  /**
	   * Updates CSS classes on DOM elements based on configuration
	   */
	  function updateClasses() {
		// Process each selector pair
		props.selectorClassPairs.forEach((pair) => {
		  if (!pair.selector) return; // Skip invalid pairs

		  const elements = document.querySelectorAll(pair.selector);
		  
		  elements.forEach(element => {
			// Handle class removal first
			if (pair.classesToRemove) {
			  const classesToRemove = pair.classesToRemove.split(' ')
				.map(cls => cls.trim())
				.filter(Boolean);
			  
			  classesToRemove.forEach(cls => {
				element.classList.remove(cls);
			  });
			}

			// Then handle class addition with observer
			if (pair.classesToAdd) {
			  const classesToAdd = pair.classesToAdd.split(' ')
				.map(cls => cls.trim())
				.filter(Boolean);
			  
			  // Initial class addition
			  classesToAdd.forEach(cls => {
				element.classList.add(cls);
			  });

			  // Set up observer to maintain classes
			  const classObserver = new MutationObserver(() => {
				classesToAdd.forEach(cls => {
				  if (!element.classList.contains(cls)) {
					element.classList.add(cls);
				  }
				});
			  });

			  classObserver.observe(element, { 
				attributes: true, 
				attributeFilter: ['class']
			  });

			  // Store observer for cleanup
			  observers.value.push(classObserver);
			}
		  });
		});
	  }
  
	  let styleElement = null;

	  onMounted(() => {
		// Initialize class management
		updateClasses();
  
		// Create style tag with optimized rules
		styleElement = document.createElement('style');
		const styleRules = props.selectorClassPairs
		  .filter(pair => pair.selector && pair.classesToAdd)
		  .map(pair => {
			const classes = pair.classesToAdd.split(' ')
			  .map(cls => cls.trim())
			  .filter(Boolean)
			  .join('.');
			return `${pair.selector}.${classes} { contain: layout style; /* Managed by Class Adder */ }`;
		  })
		  .join('\n');
		
		styleElement.innerHTML = styleRules;
		document.head.appendChild(styleElement);
	  });
  
	  onUnmounted(() => {
		// Clean up all observers
		observers.value.forEach(obs => obs.disconnect());
		observers.value = [];
		// Remove style element
		if (styleElement && document.head.contains(styleElement)) {
		  document.head.removeChild(styleElement);
		}
	  });
  
	  return {
		updateClasses,
	  };
	},
  };
  </script>

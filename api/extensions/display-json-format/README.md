# JSON Format Display Extension for Directus

A Directus display extension that formats JSON or JSON-like strings into readable HTML format with customizable templates.

## Features

- Formats JSON data with customizable HTML templates
- Supports both single objects and arrays
- Handles nested JSON structures
- Supports recursive formatting for lists
- Customizable CSS classes for styling
- UTF-8 character support

## Installation

1. Install the extension:
```bash
npm install directus-extension-stockApp-json-format-display
```

2. Build the extension:
```bash
npm run build
```

## Configuration Options

The extension provides several configuration options:

- **Format**: HTML template with placeholders for JSON values
- **Recursive**: Enable/disable recursive formatting for arrays/objects
- **WrapperClass**: CSS class for the wrapper element (used in recursive mode)
- **InnerClass**: CSS class for inner elements (used in recursive mode)

## Usage Examples

### 1. Simple Key-Value Object

JSON Data:
```json
{
    "name": "John Doe",
    "age": "30"
}
```

Configuration:
```
Format: <div>{key}: {value}</div>
Recursive: true
```

Output:
```
name: John Doe
age: 30
```

### 2. Array of Objects

JSON Data:
```json
[
    {"product": "Varžteliai noselėms", "quantity": "N9"},
    {"product": "Screws", "quantity": "M5"}
]
```

Configuration:
```
Format: <div class="item">{product} - {quantity}</div>
Recursive: true
WrapperClass: products-list
InnerClass: product-item
```

Output:
```
Varžteliai noselėms - N9
Screws - M5
```

### 3. Simple Object (Non-recursive)

JSON Data:
```json
{
    "title": "Hello",
    "message": "World"
}
```

Configuration:
```
Format: <div class="greeting">{title} {message}!</div>
Recursive: false
```

Output:
```
Hello World!
```

### 4. Object with Custom Formatting

JSON Data:
```json
{
    "status": "active",
    "user": "admin"
}
```

Configuration:
```
Format: <span class="badge badge-{status}">{user}</span>
Recursive: true
```

Output:
```
<span class="badge badge-active">admin</span>
```

## Key Points

1. **Recursive Mode**:
   - When `recursive: true`, processes each key-value pair separately
   - Automatically uses object keys as {key} and values as {value}
   - Best for arrays or when you want to process each property individually

2. **Non-recursive Mode**:
   - When `recursive: false`, processes the entire object at once
   - Use when you want to format the entire object in a single template
   - Better performance for simple objects

3. **Format Templates**:
   - Use {propertyName} to insert values
   - For recursive mode with simple objects, you can use {key} and {value}
   - Supports HTML in format string for styling

4. **UTF-8 Support**:
   - Handles special characters and different languages properly
   - No special configuration needed for UTF-8 characters

## Error Handling

The extension handles various edge cases:

- Empty data shows "No data available" message
- Invalid JSON displays "Invalid JSON data" message
- Invalid data types show "Invalid data type" message

## CSS Styling

You can style the output using the provided class options:

```css
.json_display_wrapper {
    /* Styles for the wrapper div in recursive mode */
}

.json_list {
    /* Styles for each item in recursive mode */
}
```

## Best Practices

1. Choose recursive mode when:
   - Working with arrays of objects
   - Need to process each property separately
   - Want to apply consistent formatting to each item

2. Choose non-recursive mode when:
   - Working with simple, single objects
   - Need custom formatting for the entire object
   - Want better performance for simple data

3. Format templates:
   - Keep HTML formatting simple and semantic
   - Use CSS classes for styling rather than inline styles
   - Test with different data lengths and content types

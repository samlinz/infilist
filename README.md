# Infilist
Dynamically generated "infinite" list library for vanilla Javascript.

Akin to RecyclerView in Android and many similar libraries in JS, but without
dependencies.

**Small demo:**
https://samlinz.github.io/infilist/

## Features
- No external dependecies, vanilla JS
- Lazily generate list items with user provided asynchronous callback
- Load only visible elements and elements inside provided treshold
- Only keep specified amount of DOM elements in page, keep others in cache to avoid rerendering (Optional)
- Specify the size for the list to allow scrollbar for full height
- Do not specify the size of the list to make "infinite" list
- Generate elements in batches or one by one
- Show and hide a spinner element using callback to indicate loading

## Installation

- Download scroll.min.js and add it to your page
```html
<script src="scroll.min.js"></script>
```
- Access the constructor using global InfiList constructor
```javascript
rootElem.scrollList = new InfiScroll(rootElem, {
    generator: function(index, resolve) {
        // Generate the HTMLElement in any way you want to here and then
        // resolve the Promise with it.
        const element = XXX;
        resolve(element);
    },
    childSize: 100, // Height of a single child element
    treshold: 7, // childSize * treshold is the size of the loaded area
    size: 100, // Total number of children (leave out if you don't want the full height immediately)
    batchLoad: true, // If true, load elements in batches instead of one by one
    spinner: show => { // Callback when elements are being loaded, to show a spinner element
        spinner.style.opacity = show ? 1 : 0;
    }
}); // Check the Optinos part for all of the available options!
```

The constructor requires a generator callback as _generator_, height of a single
child element in pixels as _childSize_ and the loaded area treshold as _treshold_.

Generator takes in an index or list of indices that are visible. The callback has to provide
the elements to resolve in that order, or _null_ if loading failed.
Note that the argument is single number if _batchLoad=false_ and list of numbers if
_batchLoad=true_.

Treshold is the size of child multiplied with the treshold value, so treshold=2
with childSize=100 would mean the area 200px above and below the visible area
have their elements loaded.

## Methods

Infilist constructor returns an object which should be kept referenced.
It has the following methods exposed:

### .invalidate()
Invalidate the list explicitly, e.g. load the visible elements.

### .updateSize(newSize: number)
Update the size of the list, also causes entire list to be invalidated.

### .reload()
Remove all children from list and reload it. Do this if the list is changed
so that the indices don't match anymore. For example, new elements are added
to the beginning of the list and the indices have thus changed.

### .updateItem(index, ...data)
Update a single item in the list. Index of the element is provided as the argument
and additional arguments to the generator function follow.

### .dispose()
Unload event listeners etc. when the list is no longer needed.

## Options

```
Required:
=========
generator - Callback that takes the visible list indices as list, and resolves to list of _HTMLElements_
treshold - childSize * treshold is the area in which list elements are generated
childSize - Size of a single child element in pixels

Optional:
=========
elementLimit    - *OPTIONAL* Maximum count of list elements in DOM, oldest entries are removed and places in cache
size            - If list is fixed size, this provides the count of elements
fixedSize       - If true, the list is full size when loaded, even without elements in DOM, elements are loaded when visible
cacheSize       - Max count of elements placed in cache after unloading from DOM, oldest are removed
domDelete       - Callback which is called with the index of list element when that element is removed from DOM
spinner         - Callback which receives true as argument when loading elements starts and false when all elements are loaded
throttleScroll  - If true, scroll event is reacted to only after a small delay. Set to false if list seems to load slowly.
keepPositionOnReload - If true, scroll position on list is maintained when reloading the whole list
batchLoad       - If true, the visible elements are generated at the same time instead of one by one
check           - Custom check which is called when list is invalidated, return true to continue invalidation or false to prevent it
```
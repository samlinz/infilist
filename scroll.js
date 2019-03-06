!(function () {
    "use strict";

    // Module constants.
    const MODULE_NAME = "InfiScroll";
    const DEFAULT_TRESHOLD = 0.5;
    const SCROLL_THROTTLE = 50;

    const OPTIONS = Object.freeze({
        TRESHOLD: "treshold", // Amount of pixels below and above the
        // parent border which are deemed 'in view'.
        // Calculated as CHILD_SIZE * TRESHOLD.
        ELEMENT_LIMIT: "elementLimit", // Maximum list elements in DOM.
        SIZE: "size", // Size of the list.
        QUERY: "generator", // Generator function.
        FIXED_SIZE: "fixedSize", // Boolean indicating if the list should initially display full height.
        CHILD_SIZE: "childSize", // Fixed height of a single list element.
        CACHE_SIZE: "cacheSize", // Size of the cache.
        INVALIDATE_CHECK: "check", // Function which will check if view should be updated
        DOM_DELETE: "domDelete", // Callback for DOM deletion
        TOGGLE_SPINNER: "spinner", // Callback to show or hide spinner animation.
        THROTTLE_SCROLL: "throttleScroll", // Callback to show or hide spinner animation.
        KEEP_POSITION_ON_RELOAD: "keepPositionOnReload", // Do not reset scroll height when reloading.
        BATCH_LOAD: "batchLoad" // Do not reset scroll height when reloading.
    });

    // Do not allow use in environments such as Node as it makes no sense.
    if (!window)
        throw new Error(
            `${MODULE_NAME} cannot be used in non-browser environment`
        );

    /**
     * Create range of numbers from start to start+N.
     *
     * @param start Starting index.
     * @param N Number of indices to generate.
     * @returns {Array} Array of range numbers.
     */
    function numRange(start, N) {
        return Array.from(Array(N || 1), (val, index) => start + index);
    }

    /**
     * Log warning message.
     * @param {string} msg Message.
     */
    function warn(msg) {
        console.warn(`${MODULE_NAME}: ${msg}`);
    }

    /**
     * Return the indices of list items which fit into the list view.
     *
     * @param {number} rootTop Container view scrollTop.
     * @param {number} rootHeight Container height.
     * @param {number} treshold Extra treshold below the visible container.
     * @param {number} childSize Fixed size of a child container.
     */
    function getChildrenInView(rootTop, rootHeight, treshold, childSize) {
        // If no size is yet available, load only the first element
        // to calculate the fixed height.
        if (!childSize) return [0];

        const top = Math.max(rootTop - treshold, 0),
            totalHeight = rootHeight + treshold * 2,
            firstChildInView = (top / childSize) >>> 0,
            firstChildExcess = firstChildInView * childSize,
            viewLeft = totalHeight - (firstChildExcess - rootTop),
            childrenInView = Math.ceil(viewLeft / childSize);

        return numRange(firstChildInView, childrenInView);
    }

    /**
     * Generate DOM id property for given list item.
     *
     * @param {number} index Ordinal index of the child in list.
     * @returns {string} Generated id property.
     */
    function getListItemId(index) {
        return `__${MODULE_NAME}_${this.__uniqueIdentifier}_index_${index}`;
    }

    /**
     * Remove given list items from DOM.
     *
     * @param {HTMLELement} parent DOM element containing children.
     * @param {number[]} elements Element ids to remove.
     * @return Map which maps element ids to removed DOM elements, for caching.
     */
    function removeChildren(parent, ...elements) {
        const result = new Map();
        elements
            .reduce((arr, val) => arr.concat(val))
            .forEach(e => {
                const childId = getListItemId.call(this, e);
                const elem = document.getElementById(childId);
                // The element is not in DOM.
                if (!elem) return;

                result.set(e, elem);
                parent.removeChild(elem);
            });

        return result;
    }

    /**
     * Validate passed options for required arguments.
     *
     * @param {Object} object Options object.
     * @param {string[]} properties Required properties.
     */
    function requireOptions(object, ...properties) {
        const missing = properties.filter(p => !(p in object));
        if (missing.length)
            throw Error(
                `Options object is missing required properties ${missing}`
            );
    }

    /**
     * Position and modify the generated child DOM element.
     *
     * @param {number} index Ordinal index in the list.
     * @param {HTMLElement} elem Generated DOM element.
     * @param {boolean} inPlace If true the new object will replace old one.
     */
    function addChild(index, elem, inPlace) {
        // Position the element absolutely according to its ordinal position.
        const childTop = index * this.__childSize;

        elem.style.position = "absolute";
        elem.style.margin = 0;
        elem.style.top = `${childTop}px`;
        elem.style.left = 0;
        elem.style.right = 0;
        elem.id = getListItemId.call(this, index);

        if (this.__childSize) {
            elem.style.height = `${this.__childSize}px`;
        }

        if (inPlace) {
            const listItemId = elem.id;
            const oldElement = document.getElementById(listItemId);
            this.element.insertBefore(elem, oldElement);
            this.element.removeChild(oldElement);
        } else {
            // Append the new child element to the containing div.
            this.element.appendChild(elem);
        }

        // If no child size is provided by the user,
        // size is calculated ad-hoc here from the first loaded
        // element.
        if (!this.__childSize) {
            this.__childSize = elem.scrollHeight;
            this.__treshold = calculateTreshold.call(this);
            recalculateHeights.call(this);
            setTimeout(this.invalidate.bind(this), 0);

            if (this.__fixedSize) {
                positionDummyElement.call(this);
            }
        }

        const finalElement = index === (this.__size - 1);
        if (finalElement) {
            if (this.__finalElement && this.__finalElement !== elem) {
                this.__finalElement.classList.remove("last-of-list");
            }
            elem.classList.add("last-of-list");
            this.__finalElement = elem;
        }

        stretchList.call(this, index);
    }

    /**
     * In dynamic sized list, stretch the list DOM element below the last
     * existing element so new elements can be generated when scrolling below it.
     * 
     * @param {number} index Last generated item index.
     */
    function stretchList(index) {
        if (this.__fixedSize || !this.__childSize || typeof this.__size !== "number") return;

        const childTop = index * this.__childSize;

        // Stretch the view below last loaded element if not the last element.
        const finalElement = index === (this.__size - 1);

        if (!finalElement) {
            // const currentScrollHeight = this.element.scrollHeight;
            const currentScrollHeight = this.__currentScrollHeight;
            const maxScrollHeight = this.__size * this.__childSize;
            const newDummyTop = childTop + this.__childSize * 5;
            if (newDummyTop > currentScrollHeight) {
                const dummyTop = Math.min(maxScrollHeight, newDummyTop);
                this.__dummyElement.style.top = `${dummyTop}px`;
                this.__currentScrollHeight = dummyTop;
                if (!isElementVisible(this.__dummyElement))
                    this.element.appendChild(this.__dummyElement);
            }
        }
    }

    /**
     * Calculate treshold value from configuration.
     */
    function calculateTreshold() {
        return this.__tresholdFactor * this.__childSize;
    }

    /**
     * After fixedSize is updated, this function will update
     * existing DOM elements already loaded to page.
     */
    function recalculateHeights() {
        for (const domElement of this.__domElements) {
            const identifier = getListItemId.call(this, domElement);
            const elem = document.getElementById(identifier);
            if (elem) {
                elem.style.height = `${this.__childSize}px`;
            }
        }
    }

    /**
     * In fixed size list, position dummy element to the end of the virtual list.
     */
    function positionDummyElement() {
        // Position dummy element to stretch the container to full height on load.
        if (!this.__fixedSize) return;

        const newTop = this.__childSize * this.__size;
        this.__dummyElement.style.top = `${newTop}px`;

        if (!isElementVisible(this.__dummyElement))
            this.element.appendChild(this.__dummyElement);
    }

    /**
     * Get boolean value indicating whether the element is currently visible.
     * 
     * @param {HTMLElement} element DOM element of which' visibility you want to get.
     */
    function isElementVisible(element) {
        return element.offsetParent;
    }

    function onListItemGenerated(index, newElement, uniqueIdentifier) {
        if (!uniqueIdentifier) {
            throw Error('Null uniqueIdentifier');
        }

        // Validate returned new child element.
        if (newElement === null
            || newElement === undefined
            || (newElement.constructor === Array && newElement.length === 0)) {
            // Prevent botched queries hanging around forever.
            if (index.constructor === Array) {
                for (const queryToDelete of index) {
                    this.__queries.delete(queryToDelete);
                }
            } else {
                this.__queries.delete(index);
            }

            return;
        }

        // The list has been reloaded while the element was being generated;
        // ignore this instance.
        if (this.__uniqueIdentifier !== uniqueIdentifier) {
            return;
        }

        if (index.constructor === Array) {
            // The result is a list of DOM elements.
            for (let i = 0; i < index.length; i++) {
                const id = index[i];
                const element = newElement[i];
                const onGenerated = onListItemGenerated.bind(this);
                setTimeout(() => onGenerated(id, element, uniqueIdentifier), 0);
            }

            return;
        }

        if (!(newElement instanceof HTMLElement))
            throw Error(
                `${MODULE_NAME} query callback resolved with non-HTMLElement result.`
            );

        // Remove this index from pending queries.
        this.__queries.delete(index);

        // Remove loaded element from cache.
        this.__cache.delete(index);
        const cachePosition = this.__cacheQueue.indexOf(index);
        if (cachePosition != -1) {
            this.__cacheQueue.splice(cachePosition, 1);
        }

        // Put to the tail of the queues.
        this.__domElements.add(index);

        addChild.call(this, index, newElement);

        // If a request to reload the list was made during reload, reload again
        // as the current state might not be valid anymore.
        if (this.__queries.size === 0) {
            if (this.__reloading) {
                this.__reloading = false;
            
                if (this.__reloadingChildrenToRemove) {
                    for (const elementToRemove of this.__reloadingChildrenToRemove) {
                        try {
                            this.element.removeChild(elementToRemove);
                        } catch (err) {
                            warn(`Child ${elementToRemove.id} to be removed after reload was not a child of root element (anymore)`)
                        }
                    }
                    this.__reloadingChildrenToRemove = null;
                }
    
                if (this.__reloadAfterInvalidation) {
                    // A new reload request has been fire while the first reload
                    // was going on; invalidate again.
                    this.__reloadAfterInvalidation = false;
                    const reload = this.reload.bind(this);
                    setTimeout(() => reload(), 10);
                }
            }
        }
    }

    /**
     * Constructor for a dynamically generated 'Infinite scroll' list.
     *
     * @param {HTMLElement} elem Element which will be turned into a scrollable list. Preferably DIV.
     * @param {Object} options Configuration for the list.
     * @constructor
     */
    function ScrollElement(elem, options) {
        // Validation
        if (!(elem instanceof HTMLElement))
            throw Error(`${elem} is not instance of HTMLElement`);

        this.element = elem;

        // The parent element has to have absolute or relative position property to allow children
        // to be placed relative to its constraints.
        const computedStyle = window.getComputedStyle(elem);
        if (!~["absolute", "relative"].indexOf(computedStyle.position))
            throw Error(
                `${elem} must have position of 'absolute' or 'relative'`
            );

        if (!options)
            throw Error(
                `options argument must be passed to ${MODULE_NAME} constructor`
            );

        // Invalidate the list when window is resized.
        this.__resizeListener = () => {
            this.invalidate();
        };
        window.addEventListener("resize", this.__resizeListener);

        // If there are multiple list instances on a single page, they
        // must be differentiated from each other.
        let uniqueIdentifier = this.element.id;
        if (!uniqueIdentifier) {
            uniqueIdentifier = (Math.random()) * 1000000 >>> 0;
        }

        // Invalidate and recalculate the list when it's scrolled.
        // Throttle event firing to avoid needless computation.
        let scrollTimeout = null;
        this.__scrollListener = () => {
            if (!this.__throttleScroll) {
                this.invalidate();
            } else {
                if (scrollTimeout !== null) {
                    clearTimeout(scrollTimeout);
                }
                const _this = this;
                scrollTimeout = setTimeout(() => {
                    _this.invalidate();
                    scrollTimeout = null;
                }, SCROLL_THROTTLE);
            }
        };
        this.__scrollListener = this.__scrollListener.bind(this);
        elem.addEventListener("scroll", this.__scrollListener);

        // Clear the container.
        while (this.element.firstChild)
            this.element.removeChild(this.element.firstChild);

        // Inner state.
        this.__domElements = new Set(); // All loaded children.
        this.__inView = new Set(); // List items in view currently.
        this.__queue = []; // Queue to determine which elements to remove from DOM.
        this.__cacheQueue = []; // Queue to determine which elements to remove from cache.
        this.__cache = new Map(); // Cached DOM elements.
        this.__queries = new Set(); // Ongoing unresolved queries for new elements.
        this.__updateRequests = new Map(); // Ongoing update requests.
        this.__uniqueIdentifier = uniqueIdentifier; // Unique identifier for this instance.
        this.__spinnerTimeout = null;
        this.__currentScrollHeight = 0;

        // Handle passed options.
        requireOptions(options, OPTIONS.QUERY);
        this.__query = options[OPTIONS.QUERY];
        this.__check = options[OPTIONS.INVALIDATE_CHECK];
        this.__childSize = options[OPTIONS.CHILD_SIZE];
        this.__fixedSize = options[OPTIONS.FIXED_SIZE];
        this.__size = options[OPTIONS.SIZE];
        this.__elementLimit = options[OPTIONS.ELEMENT_LIMIT];
        this.__cacheSize = options[OPTIONS.CACHE_SIZE];
        this.__domDelete = options[OPTIONS.DOM_DELETE];
        this.__spinner = options[OPTIONS.TOGGLE_SPINNER];
        this.__keepPositionOnReload = options[OPTIONS.KEEP_POSITION_ON_RELOAD];
        this.__batchLoad = options[OPTIONS.BATCH_LOAD];
        this.__throttleScroll = OPTIONS.THROTTLE_SCROLL in options ?
            options[OPTIONS.THROTTLE_SCROLL] :
            true;
        this.__tresholdFactor =
            OPTIONS.TRESHOLD in options ?
            options[OPTIONS.TRESHOLD] :
            DEFAULT_TRESHOLD;

        // Idenfity this session by random id, if the list is reloaded
        // it will be different.
        this.__uniqueIdentifier = Math.random() * 1000000 >>> 0;

        // Treshold calculation is deferred if no fixed child size is
        // provided.
        if (this.__childSize) {
            this.__treshold = calculateTreshold.call(this);
        }

        // Show spinner if it is supported.
        if (this.__spinner) {
            if (typeof this.__spinner !== "function") {
                throw Error("Given spinner callback is not function. " +
                    "Provide a function which takes a single boolean parameter.");
            }

            this.__spinner(true);
        }

        (function () {
            const extraKeys = Object.keys(options).filter(
                k => !~Object.values(OPTIONS).indexOf(k)
            );
            if (extraKeys.length)
                warn(
                    `Options object contained invalid options '${extraKeys}'. Typos?`
                );
        })();

        // Create 'dummy' div element which is used to handle the scroll height.
        const dummy = document.createElement("div");
        dummy.style.height = dummy.style.width = "1px";
        dummy.style.visibility = "hidden";
        dummy.style.position = "absolute";
        this.__dummyElement = dummy;

        positionDummyElement.call(this);

        // Initial refresh
        setTimeout(this.invalidate.bind(this), 0);
    }

    /**
     * Remove all DOM elements and cached items and initiate invalidation.
     * This should be done when existing list structure is no longer valid.
     * 
     * For example, if new elements are inserted in the middle of the list
     * the list has to be reloaded.
     * 
     * If a reload is initiated while reload/invalidation cycle is still
     * going on the reload will be deferred until the previous cycle is done.
    */
    ScrollElement.prototype.reload = function () {
        if (this.__reloading) {
            this.__reloadAfterInvalidation = true;
            return;
        }
        this.__reloading = true;
       
        // Mark elements to be removed after reload.
        const childNodes = this.element.childNodes;
        const childrenToRemove = [];
        for (const childElement of childNodes) {
            if (childElement.id.indexOf(MODULE_NAME) !== -1) {
                childrenToRemove.push(childElement);
            }
        }

        this.__reloadingChildrenToRemove = childrenToRemove;

        // Clear caches etc.
        this.__domElements.clear();
        this.__inView.clear();
        this.__cache.clear();
        this.__queries.clear();
        this.__updateRequests.clear();
        this.__queue = [];
        this.__cacheQueue = [];
        if (!this.__keepPositionOnReload) {
            this.__dummyElement.top = 0;
            this.__currentScrollHeight = 0;
        }

        // Create a new unique identifier.
        this.__uniqueIdentifier = Math.random() * 1000000 >>> 0;

        // Invalidate the list to reload it.
        const invalidate = this.invalidate.bind(this)
        setTimeout(() => invalidate(), 0);
    };

    /**
     * Invalidate the current state, recalculate visible list items and
     * generate or fetch the DOM elements and add them to the page.
     * 
     * @param {boolean} force If true then the list will be updated even if
     * check fails or root element is not visible.
     */
    ScrollElement.prototype.invalidate = function (force = false) {
        // If force bit is up, ignore checks.
        if (!force) {
            // If the user has provided custom check run it
            // If the user provided function returns false, do not continue
            if (this.__check) {
                if (!this.__check())
                    return;
            } else {
                // If the element is not visible, do not update.
                if (isElementVisible(this.element) === null)
                    return;
            }
        }

        // Get scrollable view dimensions.
        let scrollTop = this.element.scrollTop;
        const height = this.element.clientHeight;

        // If element is not visible, scrollTop returns 0.
        // In this case use the previous value if recorded.
        if (!scrollTop && !isElementVisible(this.element) && this.__lastScrollTop) {
            scrollTop = this.__lastScrollTop;
        }
        this.__lastScrollTop = scrollTop;

        // Calculate which elements are in the view or inside treshold.
        const elementsInView = getChildrenInView(
            scrollTop,
            height,
            this.__treshold,
            this.__childSize
        );

        // Calculate set difference; which elements should be loaded.
        let difference = elementsInView.filter(
            e => !this.__domElements.has(e)
        );
        // Remove elements which have index higher than the set size of the list.
        difference = difference
            .filter(e => {
                if (typeof this.__size === "number") {
                    return e < this.__size;
                }
                return true;
            });

        this.__inView = new Set(elementsInView);

        // If a limit for loaded DOM elements has been set, remove the oldest
        // elementst in list.
        if (this.__elementLimit) {
            const elementsToRemove = [];
            let i = 0;
            while (
                this.__queue.length > this.__elementLimit &&
                i++ < this.__queue.length
            ) {
                const candidateForRemoval = this.__queue.shift();

                if (
                    this.__inView.has(candidateForRemoval) ||
                    this.__queries.has(candidateForRemoval)
                )
                    continue;
                elementsToRemove.push(candidateForRemoval);
            }

            if (elementsToRemove.length) {
                const removeElements = () => {
                    // Remove oldest DOM elements and push the data into cache.
                    const removedElements = removeChildren.call(this,
                        this.element,
                        elementsToRemove
                    );
                    for (const [
                            removedId,
                            removedDom
                        ] of removedElements.entries()) {
                        this.__cacheQueue.push(removedId);
                        this.__cache.set(removedId, removedDom);
                        this.__domElements.delete(removedId);
                        if (this.__domDelete) __domDelete(removedDom);
                    }

                    // Truncate the cache according to cacheSize.
                    while (
                        this.__cacheSize &&
                        this.__cacheQueue.length > this.__cacheSize
                    ) {
                        const removeCachedId = this.__cacheQueue.shift();
                        this.__cache.delete(removeCachedId);
                    }
                };
                setTimeout(removeElements.bind(this), 0);
            }
        }

        let childrenToLoad = [];

        // Persist the unique identifier at the moment of invalidation.
        const uniqueIdentifier = this.__uniqueIdentifier;

        // Generate required list elements.
        let lastChild = null;
        for (const childToQuery of difference) {
            // Do not attempt to load elements past the fixed size.
            if (typeof this.__size === "number" && childToQuery >= this.__size) continue;
            
            // Show spinner if applicable.
            if (this.__spinner) {
                this.__spinner(true);
                clearTimeout(this.__spinnerTimeout);
                const _spinner = this.__spinner;
                this.__spinnerTimeout = setTimeout(() => _spinner(false), 100);
            }

            // Do not invoke generator if query is unresolved already.
            if (!this.__queries.has(childToQuery)) {
                this.__queue.push(childToQuery);

                // Check if the DOM element has already been generated and cached.
                if (this.__cache.has(childToQuery)) {
                    onListItemGenerated.call(
                        this,
                        childToQuery,
                        this.__cache.get(childToQuery),
                        uniqueIdentifier
                    );
                } else {
                    this.__queries.add(childToQuery);
                    childrenToLoad.push(childToQuery);
                }
            }

            lastChild = childToQuery;
        }

        // Stretch the list down even before the elements have been loaded so
        // the scroll isn't so jagged.
        if (lastChild) {
            stretchList.call(this, lastChild);
        }

        if (!childrenToLoad.length)
            return;

        const onGenerated = onListItemGenerated.bind(this);
        const generate = this.__query.bind(this);

        if (this.__batchLoad) {
            // If the user wants to load in batches, call the generator with
            // all of the elements at once.
            generate(childrenToLoad, newElements =>
                onGenerated(childrenToLoad, newElements, uniqueIdentifier));
        } else {
            for (const childToQuery of childrenToLoad) {
                // Calling generator function and adding to DOM are both
                // heavy operations and have to be passed as separate events
                // to avoid browser postponing them too much and making
                // list updates slow.
                generate(childToQuery, newElement =>
                    onGenerated(childToQuery, newElement, uniqueIdentifier));
            }
        }
    };

    /**
     * Add a new list item.
     *
     * @param {HtmlElement} elem HTML element to append to the scrollable list.
     */
    ScrollElement.prototype.updateItem = function (index, ...data) {
        // The element is not visible; don't update
        if (!this.__domElements.has(index)) return;

        // Set random number as identifier for latest update request.
        const randomIndex = Math.random() * 1000 >>> 0;
        this.__updateRequests.set(index, randomIndex)

        this.__query(index, updatedElement => {
            if (!updatedElement) return;

            if (updatedElement.constructor === Array) {
                updatedElement = updatedElement[0];
            }

            const latestRequestIndex = this.__updateRequests.get(index);
            if (latestRequestIndex !== randomIndex) return;
            addChild.call(this, index, updatedElement, true);
        }, ...data);
    };

    ScrollElement.prototype.updateSize = function (size) {
        if (typeof size !== "number" || size < 0)
            throw Error(`Invalid size ${size}`);

        const oldSize = this.__size;
        const newSize = +size;

        if (newSize === oldSize) return;
        this.__size = newSize;

        // Update scroll element height if fixed.
        positionDummyElement.call(this);

        // Update scroll element height so it doesn't go out of bounds.
        const newMaxScrollHeight = newSize * this.__childSize;
        const dummyTop = Number.parseInt(this.__dummyElement.style.top);
        const scrollTop = this.element.scrollTop + this.element.clientHeight;

        // Move the dummy element so the list doesn't stretch over last element.
        if (dummyTop > newMaxScrollHeight) {
            this.__dummyElement.style.top = `${newMaxScrollHeight}px`;
            this.__currentScrollHeight = newMaxScrollHeight;
        }

        // Move visible area up if it is left outside the new list size.
        if (scrollTop > newMaxScrollHeight) {
            this.element.scrollTop = Math.max(newMaxScrollHeight
                - this.element.clientHeight, 0);
        }

        // Remove list elements which' index is too large for the new size.
        let removeElements = [];
        for (const domElementId of this.__domElements) {
            if (domElementId >= newSize) {
                removeElements.push(domElementId);
            }
        }

        if (removeElements.length) {
            removeChildren.call(this, this.element, removeElements);
            for (const removedChild of removeElements) {
                this.__domElements.delete(removedChild);
                this.__cache.delete(removedChild);
                const queueIndex = this.__queue.indexOf(removedChild);
                if (queueIndex !== -1) {
                    this.__queue.splice(queueIndex, 1);
                }
                const cacheIndex = this.__cacheQueue.indexOf(removedChild);
                if (cacheIndex !== -1) {
                    this.__cacheQueue.splice(cacheIndex, 1);
                }
            }
        }

        if (newSize === 0) {
            // If list is emptied, verify that there are no elements ghosting.
            const childElements = Array.from(this.element.children);
            for (const childElement of childElements) {
                // Ignore non-list elements.
                if (!childElement.id.includes(MODULE_NAME))
                    continue;
                
                // Remove all ghost item elements.
                warn(`Found an child element '${childElement.id}' when the size was set to 0!`);
                this.element.removeChild(childElement);
            }
        }

        // The list needs to be invalidated if it was empty,
        // otherwise nothing will be visible.
        if (oldSize === 0) {
            this.invalidate.call(this);
        }
    }

    /**
     * Dispose event listeners when the list is no longer needed.
     */
    ScrollElement.prototype.dispose = function () {
        window.removeEventListener("resize", this.__resizeListener);
        this.element.removeEventListener("scroll", this.__scrollListener);
    };

    // Bind as global function
    if (MODULE_NAME in window)
        throw new Error(
            `CLASH: Global property ${MODULE_NAME} exist already in window!`
        );
    window[MODULE_NAME] = ScrollElement;
})();
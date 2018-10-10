!function () {
    "use strict";
    const MODULE_NAME = 'InfiScroll';

    // Defaults
    const DEFAULT_TRESHOLD = 0.5;

    if (!window)
        throw new Error(`${MODULE_NAME} cannot be used in non-browser environment`);

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

    function onResize(elem) {
        elem.__size = this.element.getBoundingClientRect();
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
        const top = rootTop
            , totalHeight = rootHeight + treshold
            , firstChildInView = (top / childSize) >>> 0
            , firstChildExcess = firstChildInView * childSize
            , viewLeft = totalHeight - (firstChildExcess - rootTop)
            , childrenInView = Math.ceil(viewLeft / childSize);

        return numRange(firstChildInView, childrenInView);
    }

    function getListItemId(index) {
        return `__${MODULE_NAME}_index_${index}`;
    }

    function addChild(index, elem, finalElement) {
        elem.style.position = 'absolute';
        elem.style.margin = 0;
        elem.style.top = `${index * this.__options.childSize}px`;
        elem.id = getListItemId(index);
        this.element.appendChild(elem);

        // Stretch the view below last loaded element
        if (!finalElement) {
            this.__dummyElement.top = `${(index + 1) * this.__options.childSize + this.__treshold}px`;
            if (this.__dummyElement.parentNode)
                this.element.removeChild(this.__dummyElement);
            this.element.appendChild(this.__dummyElement);
        }
        /*        if (!this.__options.fixedSize && this.__options.scrollOnLoad === true) {
                    elem.scrollIntoView({
                        behavior: 'smooth',
                        block: 'end'
                    });
                }*/
    }

    function ScrollElement(elem, options) {
        // Validation
        if (!(elem instanceof HTMLElement))
            throw Error(`${elem} is not instance of HTMLElement`);

        this.element = elem;

        const computedStyle = window.getComputedStyle(elem);
        if (!~(['absolute', 'relative'].indexOf(computedStyle.position)))
            throw Error(`${elem} must have position of 'absolute' or 'relative'`);

        if (!options)
            throw Error(`options argument must be passed to ${MODULE_NAME} constructor`);

        // Listen for window size change
        this.__resizeListener = (function () {
            this.invalidate();
        }).bind(this);
        window.addEventListener('resize', this.__resizeListener);

        let scrollTimeout = null;

        this.__scrollListener = () => {
            if (scrollTimeout !== null) {
                clearTimeout(scrollTimeout);
            }
            scrollTimeout = setTimeout(() => {
                this.invalidate();
                scrollTimeout = null;
            }, 50);
        };
        elem.addEventListener('scroll', this.__scrollListener);

        // Clear the container
        while (this.element.firstChild)
            this.element.removeChild(this.element.firstChild);

        // Loaded children indices
        this.__children = new Set();
        // Visible children indexes
        this.__visible = new Set();
        // Queue for removing old children from DOM
        this.__queue = [];
        this.__options = options;
        this.__queries = new Set();

        if (!('query' in options))
            throw Error('query must be defined in options');

        if (!('childSize' in options))
            throw Error('childSize must be defined in options');

        const dummy = document.createElement('div');
        dummy.style.height = dummy.style.width = 0;
        dummy.style.visibility = 'none';
        dummy.style.position = 'absolute';
        if ('size' in options && options.fixedSize === true) {
            // Create dummy element to stretch the container to full height
            dummy.style.top = `${this.__options.childSize * (this.__options.size + 1)}px`;
            this.element.appendChild(dummy);
        }
        this.__dummyElement = dummy;

        this.__treshold = ('treshold' in options
            ? options.treshold
            : DEFAULT_TRESHOLD)
            * options.childSize;

        // Initial refresh
        setTimeout(() => this.invalidate(), 0);
    }

    ScrollElement.prototype.invalidate = function () {
        console.log('Invalidating scrollView');

        const scrollTop = this.element.scrollTop;
        const height = this.element.clientHeight;

        const elementsInView = getChildrenInView(scrollTop, height, this.__treshold, this.__options.childSize);
        const difference = elementsInView.filter(e => !this.__children.has(e));

        elementsInView.forEach(e => this.__children.add(e));

        const queries = this.__queries;
        const _this = this;
        const size = this.__options.size;

        for (const childToQuery of difference) {
            if (size && childToQuery > size)
                continue;

            if (!queries.has(childToQuery)) {
                this.__options.query(childToQuery, elem => {
                    if ((elem === null || elem === undefined))
                        return;

                    if (!(elem instanceof HTMLElement))
                        throw Error(`${MODULE_NAME} query callback resolved with non-HTMLElement result`);

                    console.log('child ' + childToQuery + ' resolved');
                    queries.delete(childToQuery);

                    addChild.call(_this, childToQuery, elem, childToQuery === size);
                });
            }

            this.__children.add(childToQuery);
        }
    };

    /**
     * Add a new list item.
     *
     * @param {HtmlElement} elem HTML element to append to the scrollable list.
     */
    ScrollElement.prototype.addItem = function (generator) {
        if (!(generator instanceof HTMLElement))
            throw new Error(`Argument is not a HTMLElement`);

    };

    ScrollElement.prototype.dispose = function () {
        window.removeEventListener('resize', this.__resizeListener);
        this.element.removeEventListener('scroll', this.__scrollListener);
    };

    // Bind as global function
    if (MODULE_NAME in window)
        throw new Error(`CLASH: Global property ${MODULE_NAME} exist already in window!`);
    window[MODULE_NAME] = ScrollElement;
}();
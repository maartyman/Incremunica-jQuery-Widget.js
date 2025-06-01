export class FastScroller {
  constructor(container, renderFn) {
    this.container = container;
    this.renderFn = renderFn;

    this.items = new Map(); // hash -> [data objects]
    this.visibleElements = new Map(); // uid -> DOM element
    this.itemHeights = new Map(); // uid -> height
    this.orderedUIDs = []; // render order: each uid is unique

    this.contentWrapper = document.createElement('div');
    this.contentWrapper.style.position = 'relative';
    this.container.appendChild(this.contentWrapper);

    this.container.style.position = 'relative';
    this.container.style.overflowY = 'scroll';

    this.container.addEventListener('scroll', this.updateVisibleElements.bind(this));
  }

  clearAll() {
    this.items.clear();
    this.itemHeights.clear();
    this.orderedUIDs = [];

    for (const el of this.visibleElements.values()) {
      el.remove();
    }
    this.visibleElements.clear();
    this.contentWrapper.innerHTML = '';
    this.contentWrapper.style.height = '0px';
  }

  handle(objects) {
    const additions = [];
    const deletions = [];

    for (const obj of objects) {
      if (obj.isAddition) {
        additions.push(obj);
      } else {
        deletions.push(obj);
      }
    }

    // Add items
    for (const { hash, data, uid, index } of additions) {
      if (!this.items.has(hash)) {
        this.items.set(hash, []);
      }
      this.items.get(hash).push({ uid, data });

      if (typeof index === 'number' && index >= 0 && index <= this.orderedUIDs.length) {
        this.orderedUIDs.splice(index, 0, uid); // insert at index
      } else {
        this.orderedUIDs.push(uid); // fallback: append
      }
    }

    // Remove one item per hash
    for (const { hash } of deletions) {
      const group = this.items.get(hash);
      if (group && group.length > 0) {
        const { uid } = group.shift(); // remove one
        this.orderedUIDs = this.orderedUIDs.filter(id => id !== uid);
        this.itemHeights.delete(uid);

        const el = this.visibleElements.get(uid);
        if (el) {
          el.remove();
          this.visibleElements.delete(uid);
        }

        if (group.length === 0) {
          this.items.delete(hash);
        }
      }
    }

    this.updateVisibleElements();
  }

  getOffsetForIndex(index) {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      const uid = this.orderedUIDs[i];
      offset += this.itemHeights.get(uid) || 50;
    }
    return offset;
  }

  getTotalHeight() {
    return this.orderedUIDs.reduce(
      (sum, uid) => sum + (this.itemHeights.get(uid) || 50), 0
    );
  }

  updateVisibleElements() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    let startIdx = 0;
    let endIdx = this.orderedUIDs.length;
    let offset = 0;

    for (let i = 0; i < this.orderedUIDs.length; i++) {
      const uid = this.orderedUIDs[i];
      const height = this.itemHeights.get(uid) || 50;
      if (offset + height >= scrollTop) {
        startIdx = i;
        break;
      }
      offset += height;
    }

    let cumulative = offset;
    for (let i = startIdx; i < this.orderedUIDs.length; i++) {
      const uid = this.orderedUIDs[i];
      const height = this.itemHeights.get(uid) || 50;
      cumulative += height;
      if (cumulative >= scrollTop + containerHeight) {
        endIdx = i + 1;
        break;
      }
    }

    const visibleNow = new Set();

    for (let i = startIdx; i < endIdx; i++) {
      const uid = this.orderedUIDs[i];
      visibleNow.add(uid);

      if (!this.visibleElements.has(uid)) {
        // Find matching data from the map
        let data = null;
        for (const group of this.items.values()) {
          for (const entry of group) {
            if (entry.uid === uid) {
              data = entry.data;
              break;
            }
          }
          if (data) break;
        }

        if (!data) continue;

        const element = this.renderFn(data);
        element.style.position = 'absolute';
        element.style.left = '0';
        element.style.width = '100%';
        const top = this.getOffsetForIndex(i);
        element.style.top = `${top}px`;

        this.contentWrapper.appendChild(element);

        const height = element.offsetHeight;
        this.itemHeights.set(uid, height);
        this.visibleElements.set(uid, element);
      } else {
        const element = this.visibleElements.get(uid);
        const top = this.getOffsetForIndex(i);
        element.style.top = `${top}px`;
      }
    }

    // Remove no-longer-visible elements
    for (const [uid, el] of this.visibleElements.entries()) {
      if (!visibleNow.has(uid)) {
        el.remove();
        this.visibleElements.delete(uid);
      }
    }

    this.contentWrapper.style.height = `${this.getTotalHeight()}px`;
  }
}

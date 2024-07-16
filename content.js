let currentIndex = -1;
let searchResults = [];
let isDragging = false;
let dragStartX, dragStartY, modalStartX, modalStartY;

const link = document.createElement('link');
link.href = chrome.runtime.getURL('styles.css');
link.type = 'text/css';
link.rel = 'stylesheet';
document.head.appendChild(link);

/**
 *
 * @param {(String|String[]|Function)} getter -
 *      string: selector to return a single element
 *      string[]: selector to return multiple elements (only the first selector will be taken)
 *      function: getter(mutationRecords|{})-> Element[]
 *          a getter function returning an array of elements (the return value will be directly passed back to the promise)
 *          the function will be passed the `mutationRecords`
 * @param {Object} opts
 * @param {Number=0} opts.timeout - timeout in milliseconds, how long to wait before throwing an error (default is 0, meaning no timeout (infinite))
 * @param {Element=} opts.target - element to be observed
 *
 * @returns {Promise<Element>} the value passed will be a single element matching the selector, or whatever the function returned
 */
function elementReady(getter, opts = {}) {
  return new Promise((resolve, reject) => {
      opts = Object.assign({
          timeout: 0,
          target: document.documentElement
      }, opts);
      const returnMultipleElements = getter instanceof Array && getter.length === 1;
      let _timeout;
      const _getter = typeof getter === 'function' ?
          (mutationRecords) => {
              try {
                  return getter(mutationRecords);
              } catch (e) {
                  return false;
              }
          } :
          () => returnMultipleElements ? document.querySelectorAll(getter[0]) : document.querySelector(getter)
      ;
      const computeResolveValue = function (mutationRecords) {
          // see if it already exists
          const ret = _getter(mutationRecords || {});
          if (ret && (!returnMultipleElements || ret.length)) {
              resolve(ret);
              clearTimeout(_timeout);


              return true;
          }
      };


      if (computeResolveValue(_getter())) {
          return;
      }


      if (opts.timeout)
          _timeout = setTimeout(() => {
              const error = new Error(`elementReady(${getter}) timed out at ${opts.timeout}ms`);
              reject(error);
          }, opts.timeout);




      new MutationObserver((mutationRecords, observer) => {
          const completed = computeResolveValue(_getter(mutationRecords));
          if (completed) {
              observer.disconnect();
          }
      }).observe(opts.target, {
          childList: true,
          subtree: true
      });
  });
}

document.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    showCustomModal();
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const modal = document.getElementById('custom-modal');
    if (modal) {
      const searchButton = modal.querySelector('input[type="submit"][value="Search"]');
      if (searchButton) {
        searchButton.click();

        setTimeout(() => { 
          scrollToResult(0); 
        }, 500);
      }
    }
  }
});

function customSearchFunction(searchTerm) {
  removeHighlights();
  highlightText(searchTerm);

  searchResults = Array.from(document.querySelectorAll('mark'));
  if (searchResults.length > 0) {
    currentIndex = 0;
    scrollToResult(currentIndex);
    showOverlay();
  } else {
    console.log("No results found.");
    showCustomModal(true, searchTerm); 
  }
}

function highlightText(searchTerm) {
  const regex = new RegExp(`(${searchTerm})`, 'gi');

  function replaceText(node) {
    if (node.nodeType === Node.TEXT_NODE && node.parentNode.nodeName !== 'SCRIPT' && node.parentNode.nodeName !== 'STYLE') {
      const match = node.nodeValue.match(regex);
      if (match) {
        const span = document.createElement('span');
        span.innerHTML = node.nodeValue.replace(regex, '<mark>$1</mark>');
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      node.childNodes.forEach(replaceText);
    }
  }

  replaceText(document.body);
}

function scrollToResult(index) {
  if (index >= 0 && index < searchResults.length) {
    const result = searchResults[index];
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    result.style.backgroundColor = 'yellow';
    if (currentIndex !== -1 && currentIndex !== index) {
      searchResults[currentIndex].style.backgroundColor = 'initial';
    }
    currentIndex = index;
    console.log(`Scrolled to result ${index + 1} of ${searchResults.length}`);
  } else {
    console.log("Index out of range.");
  }
}

document.addEventListener('keydown', function(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (currentIndex < searchResults.length - 1) {
      scrollToResult(currentIndex + 1);
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (currentIndex > 0) {
      scrollToResult(currentIndex - 1);
    }
  }
});

function removeHighlights() {
  document.querySelectorAll('mark').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  searchResults = [];
  currentIndex = -1;
  hideOverlay();
}

function createCustomModal(showAskAI = false, searchTerm = '') {
  const existingModal = document.getElementById('custom-modal');
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  const modal = document.createElement('div');
  modal.id = 'custom-modal';
  modal.style.position = 'fixed';
  modal.style.top = '10px';
  modal.style.right = '10px';
  modal.style.backgroundColor = 'white';
  modal.style.padding = '10px';
  modal.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
  modal.style.zIndex = '9999';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.width = '400px';
  modal.style.cursor = 'move';

  modal.addEventListener('mousedown', function(event) {
    if (event.target !== modal) return;
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    modalStartX = modal.offsetLeft;
    modalStartY = modal.offsetTop;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  });

  const inputContainer = document.createElement('div');
  inputContainer.classList.add('input-container');

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter search term';
  input.value = searchTerm;
  inputContainer.appendChild(input);

  const searchButton = document.createElement('input');
  searchButton.type = 'submit';
  searchButton.value = 'Search';
  searchButton.onclick = function() {
    const searchTerm = input.value.trim();
    if (searchTerm) {
      customSearchFunction(searchTerm);
    } 
    else if (!searchTerm && showAskAI){
      removeAskAIButton();
    }
  };
  inputContainer.appendChild(searchButton);

  if (showAskAI) {
    const askAIButton = document.createElement('input');
    askAIButton.type = 'submit';
    askAIButton.value = 'Ask AI';
    askAIButton.onclick = function() {
      const question = input.value.trim();
      if (question) {
        askAIFromContent(question);
      }
    };
    inputContainer.appendChild(askAIButton);
  }

  modal.appendChild(inputContainer);

  const responseContainer = document.createElement('div');
  responseContainer.id = 'ai-response-container';
  responseContainer.classList.add('ai-response-container');
  responseContainer.classList.add('scrollable'); 
  modal.appendChild(responseContainer);

  document.body.appendChild(modal);

  input.focus();
}

function showCustomModal(showAskAI = false, searchTerm = '') {
  createCustomModal(showAskAI, searchTerm);
}

function showOverlay() {
  let overlay = document.getElementById('custom-search-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-search-overlay';
    overlay.classList.add('custom-search-overlay');
    const upArrow = document.createElement('button');
    upArrow.textContent = '↑';
    upArrow.classList.add('overlay-button');
    upArrow.onclick = function () {
      if (currentIndex > 0) {
        scrollToResult(currentIndex - 1);
      }
    };

    const downArrow = document.createElement('button');
    downArrow.textContent = '↓';
    downArrow.classList.add('overlay-button');
    downArrow.onclick = function () {
      if (currentIndex < searchResults.length - 1) {
        scrollToResult(currentIndex + 1);
      }
    };

    const closeButton = document.createElement('button');
    closeButton.textContent = 'X';
    closeButton.classList.add('overlay-button');
    closeButton.onclick = function () {
      removeHighlights();
    };

    overlay.appendChild(upArrow);
    overlay.appendChild(downArrow);
    overlay.appendChild(closeButton);
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
  }
}

function hideOverlay() {
  const overlay = document.getElementById('custom-search-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function onDrag(event) {
  if (isDragging) {
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    const newLeft = modalStartX + deltaX;
    const newTop = modalStartY + deltaY;
    const modal = document.getElementById('custom-modal');
    modal.style.left = `${newLeft}px`;
    modal.style.top = `${newTop}px`;
  }
}

function stopDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function getAllTextFromPage() {
  const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const paragraphs = document.querySelectorAll('p');

  let pageText = '';

  headers.forEach(header => {
    pageText += header.textContent.trim() + ' ';
  });

  paragraphs.forEach(paragraph => {
    pageText += paragraph.textContent.trim() + ' ';
  });

  return pageText.trim();
}

async function askAIFromContent(question) {
  const pageText = getAllTextFromPage();
  const responseContainer = document.getElementById('ai-response-container');
  responseContainer.style.display = 'block'; 
  responseContainer.innerHTML = '';
  responseContainer.classList.add('scrollable'); 

  chrome.runtime.sendMessage(
    {
      action: 'askAI',
      question,
      pageText
    }
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const responseContainer = document.getElementById('ai-response-container');

  if (message.action === 'partialResponse') {
    if (!message.text.includes('<|eot_id|>')) {
    responseContainer.innerHTML += message.text; 
  }} else if (message.action === 'streamEnd') {
    console.log('Stream ended');
  } else if (message.action === 'error') {
    responseContainer.innerHTML = `<strong>Error:</strong> <p>${message.text}</p>`;
  }
  responseContainer.scrollTop = responseContainer.scrollHeight;

});

function addHighlighting() {

  function splitTextNode(node) {
      let text = node.textContent;
      let sentences = text.split(/(?<=[.,;])/);

      let chunks = [];
      let currentChunk = [];

      sentences.forEach(sentence => {
          let words = sentence.trim().split(/\s+/);
          words.forEach(word => {
            currentChunk.push(word);
    
            if (currentChunk.length >= 3) {
              chunks.push(currentChunk.join(' '));
              currentChunk = [];
            }
          });

      if (currentChunk.length > 0) {
        if (chunks.length > 0) {
          let lastChunk = chunks.pop();
          lastChunk += ' ' + currentChunk[0];
          chunks.push(lastChunk);
          currentChunk = currentChunk.slice(1); 
        }
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    });

      return chunks;
  }

  function wrapTextNode(textNode) {
      let chunks = splitTextNode(textNode);

      let fragment = document.createDocumentFragment();

      chunks.forEach(chunk => {
          let span = document.createElement('span');
          span.textContent = chunk + ' ';

          span.addEventListener('mouseenter', () => {
              span.classList.add('highlighted');
          });

          span.addEventListener('mouseleave', () => {
              span.classList.remove('highlighted');
          });

          span.addEventListener('click', () => {
            span.classList.toggle('persistent-highlight');
        });

          fragment.appendChild(span);
      });

      return fragment;
  }

  let paragraphs = document.querySelectorAll('p');
  paragraphs.forEach(paragraph => {
      let childNodes = Array.from(paragraph.childNodes);

      childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
              let wrappedFragment = wrapTextNode(node);
              paragraph.replaceChild(wrappedFragment, node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
              let elementNodes = Array.from(node.childNodes);
              elementNodes.forEach(childNode => {
                  if (childNode.nodeType === Node.TEXT_NODE) {
                      let wrappedFragment = wrapTextNode(childNode);
                      node.replaceChild(wrappedFragment, childNode);
                  }
              });
          }
      });
  });
}

elementReady('body').then(function (body){
console.log("content is loaded");  
addHighlighting();
})
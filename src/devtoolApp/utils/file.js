import prettier from 'prettier';
import htmlParser from 'prettier/parser-html';
import babelParser from 'prettier/parser-babel';
import postCssParser from 'prettier/parser-postcss';
import * as zip from '@zip.js/zip.js';

export const resolveURLToPath = (cUrl, cType, cContent) => {
  let filepath, filename, isDataURI;
  let foundIndex = cUrl.search(/:\/\//);
  // Check the url whether it is a link or a string of text data
  if (foundIndex === -1 || foundIndex >= 10) {
    isDataURI = true;
    console.log('[DEVTOOL]', 'Data URI Detected!!!!!');
    // Data URI
    if (cUrl.indexOf('data:') === 0) {
      let dataURIInfo = cUrl
        .split(';')[0]
        .split(',')[0]
        .substring(0, 30)
        .replace(/[^A-Za-z0-9]/g, '.');
      filename = dataURIInfo + '.' + Math.random().toString(16).substring(2) + '.txt';
    } else {
      filename = 'data.' + Math.random().toString(16).substring(2) + '.txt';
    }
    filepath = '_DataURI/' + filename;
  } else {
    isDataURI = false;
    if (cUrl.split('://')[0].includes('http')) {
      // For http:// https://
      filepath = cUrl.split('://')[1].split('?')[0];
    } else {
      // For webpack:// ng:// ftp:// will be webpack--- ng--- ftp---
      filepath = cUrl.replace('://', '---').split('?')[0];
    }
    if (filepath.charAt(filepath.length - 1) === '/') {
      filepath = filepath + 'index.html';
    }
    filename = filepath.substring(filepath.lastIndexOf('/') + 1);
  }

  // Get Rid of QueryString after ;
  filename = filename.split(';')[0];
  filepath = filepath.substring(0, filepath.lastIndexOf('/') + 1) + filename;

  const noExtension = filename.search(/\./) === -1;
  // Add default extension to non extension filename
  if (noExtension) {
    let haveExtension = null;
    if (cType && cContent) {
      // Special Case for Images with Base64
      if (cType.indexOf('image') !== -1) {
        if (cContent.charAt(0) === '/') {
          filepath = filepath + '.jpg';
          haveExtension = 'jpg';
        }
        if (cContent.charAt(0) === 'R') {
          filepath = filepath + '.gif';
          haveExtension = 'gif';
        }
        if (cContent.charAt(0) === 'i') {
          filepath = filepath + '.png';
          haveExtension = 'png';
        }
        if (cContent.charAt(0) === 'U') {
          filepath = filepath + '.webp';
          haveExtension = 'webp';
        }
      }
      // Stylesheet | CSS
      if (cType.indexOf('stylesheet') !== -1 || cType.indexOf('css') !== -1) {
        filepath = filepath + '.css';
        haveExtension = 'css';
      }
      // JSON
      if (cType.indexOf('json') !== -1) {
        filepath = filepath + '.json';
        haveExtension = 'json';
      }
      // Javascript
      if (cType.indexOf('javascript') !== -1) {
        filepath = filepath + '.js';
        haveExtension = 'js';
      }
      // HTML
      if (cType.indexOf('html') !== -1) {
        filepath = filepath + '.html';
        haveExtension = 'html';
      }

      if (!haveExtension) {
        filepath = filepath + '.html';
        haveExtension = 'html';
      }
    } else {
      // Add default html for text document
      filepath = filepath + '.html';
      haveExtension = 'html';
    }
    console.log(
      '[DEVTOOL]',
      'File without extension: ',
      filename,
      'Will process as: ',
      filename + '.' + haveExtension,
      filepath
    );
    filename = filename + '.' + haveExtension;
  }

  // Remove path violation case
  filepath = filepath
    .replace(/:|\\|=|\*|\.$|"|'|\?|~|\||<|>/g, '')
    .replace(/\/\//g, '/')
    .replace(/(\s|\.)\//g, '/')
    .replace(/\/(\s|\.)/g, '/');

  filename = filename.replace(/:|\\|=|\*|\.$|"|'|\?|~|\||<|>/g, '');

  // Decode URI
  if (filepath.indexOf('%') !== -1) {
    try {
      filepath = decodeURIComponent(filepath);
      filename = decodeURIComponent(filename);
    } catch (err) {
      console.log('[DEVTOOL]', err);
    }
  }

  // Strip double slashes ---
  while (filepath.includes('//')) {
    filepath = filepath.replace('//', '/');
  }

  // Strip the first slash '/src/...' -> 'src/...'
  if (filepath.charAt(0) === '/') {
    filepath = filepath.slice(1);
  }

  //  console.log('Save to: ', filepath);
  //  console.log('File name: ',filename);

  return {
    path: filepath,
    name: filename,
    dataURI: isDataURI && cUrl,
  };
};

export const resolveDuplicatedResources = (resourceList = []) => {
  const resolvedListByKey = {};
  const result = [];
  const resourceListUniqByUrl = Object.values(
    resourceList.reduce(
      (list, res) => ({
        ...list,
        ...(!list[res.url] || !list[res.url].content || res.content
          ? {
              [res.url]: res,
            }
          : {}),
      }),
      {}
    )
  );
  resourceListUniqByUrl
    .filter((r) => r && r.saveAs && r.saveAs.path && r.saveAs.name)
    .sort((rA, rB) => rA.saveAs.path.localeCompare(rB.saveAs.path))
    .forEach((r) => {
      resolvedListByKey[r.saveAs.path] = (resolvedListByKey[r.saveAs.path] || []).concat([r]);
    });
  Object.values(resolvedListByKey).forEach((rGroup) => {
    result.push(
      ...(rGroup.length < 2
        ? rGroup
        : rGroup.map((r, rIndex) =>
            rIndex === 0
              ? r
              : {
                  ...r,
                  saveAs: {
                    ...r.saveAs,
                    name: r.saveAs.name.replace(/(\.)(?!.*\.)/g, ` (${rIndex}).`),
                    path: r.saveAs.path.replace(/(\.)(?!.*\.)/g, ` (${rIndex}).`),
                  },
                }
          ))
    );
  });
  return result;
};

export const downloadZipFile = (toDownload, options, eachDoneCallback, callback) => {
  const blobWrite = new zip.BlobWriter('application/zip');
  const zipWriter = new zip.ZipWriter(blobWrite);
  addItemsToZipWriter(
    zipWriter,
    toDownload,
    options,
    eachDoneCallback,
    downloadCompleteZip.bind(this, zipWriter, blobWrite, callback)
  );
};

export const addItemsToZipWriter = (zipWriter, items, options, eachDoneCallback, callback) => {
  const item = items[0];
  const rest = items.slice(1);

  // if item exist so add it to zip
  if (item) {
    // Beautify here
    if (options?.beautifyFile && !item.encoding && !!item.content) {
      try {
        const fileExt = item.saveAs?.name?.match(/\.([0-9a-z]+)(?:[\?#]|$)/);
        switch (fileExt ? fileExt[1] : '') {
          case 'js': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'babel', plugins: [babelParser] });
            break;
          }
          case 'json': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'json', plugins: [babelParser] });
            break;
          }
          case 'html': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'html', plugins: [htmlParser, babelParser, postCssParser] });
            break;
          }
          case 'css': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'css', plugins: [postCssParser] });
            break;
          }
        }
      } catch (err) {
        console.log('[DEVTOOL]', 'Cannot format file', item, err);
      }
    }

    // Check whether base64 encoding is valid
    if (item.encoding === 'base64') {
      // Try to decode first
      try {
        atob(item.content);
      } catch (err) {
        console.log('[DEVTOOL]', item.url, ' is not base64 encoding, try to encode to base64.');
        try {
          item.content = btoa(item.content);
        } catch (err) {
          console.log('[DEVTOOL]', item.url, ' failed to encode to base64, fallback to text.');
          item.encoding = null;
        }
      }
    }

    // Create a reader of the content for zip
    const resolvedContent =
      item.encoding === 'base64'
        ? new zip.Data64URIReader(item.content || '')
        : new zip.TextReader(item.content || 'No Content: ' + item.url);

    // Item has no content
    const isNoContent = !item.content;
    const ignoreNoContentFile = !!options?.ignoreNoContentFile;
    if (isNoContent && ignoreNoContentFile) {
      // Exclude file as no content
      console.log('[DEVTOOL]', 'EXCLUDED: ', item.url);
      eachDoneCallback(item, true);
      // To the next item
      addItemsToZipWriter(zipWriter, rest, options, eachDoneCallback, callback);
    } else {
      // Make sure the file has some byte otherwise no import to avoid corrupted zip
      if (resolvedContent.size > 0 || resolvedContent['blobReader']?.size > 0) {
        zipWriter.add(item.saveAs.path, resolvedContent).finally(() => {
          eachDoneCallback(item, true);
          addItemsToZipWriter(zipWriter, rest, options, eachDoneCallback, callback);
        });
      } else {
        // If no size, exclude the item
        console.log('[DEVTOOL]', 'EXCLUDED: ', item.url);
        eachDoneCallback(item, false);
        // To the next item
        addItemsToZipWriter(zipWriter, rest, options, eachDoneCallback, callback);
      }
    }
  } else {
    // Callback when all done
    callback();
  }
  return rest;
};

export const downloadCompleteZip = (zipWriter, blobWriter, callback) => {
  zipWriter.close();
  blobWriter.getData().then((blob) => {
    chrome.tabs.get(chrome.devtools.inspectedWindow.tabId, function (tab) {
      let url = new URL(tab.url);
      let filename = url.hostname ? url.hostname.replace(/([^A-Za-z0-9.])/g, '_') : 'all';
      let a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename + '.zip';
      a.click();
      callback();
    });
  });
};

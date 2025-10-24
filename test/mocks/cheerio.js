// Mock for cheerio to avoid ESM issues in Jest
// This provides a basic implementation for testing

const cheerioMock = {
  load: function (html) {
    return function $(selector) {
      // Mock jQuery-like object
      const mockElement = {
        text: () => "",
        html: () => "",
        attr: () => undefined,
        find: () => mockElement,
        each: () => mockElement,
        map: () => [],
        toArray: () => [],
        length: 0,
      };
      return mockElement;
    };
  },
};

module.exports = cheerioMock;
module.exports.default = cheerioMock;

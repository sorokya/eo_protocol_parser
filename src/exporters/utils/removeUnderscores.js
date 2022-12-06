function removeUnderscores (str) {
  let parts = str.split('_');

  parts.forEach((part, index) => {
    if (part === part.toUpperCase()) {
      let letters = part.toLowerCase().split('');
      letters[0] = letters[0].toUpperCase();
      parts[index] = letters.join('');
    }
  });

  return parts.join('');
}

module.exports = removeUnderscores;

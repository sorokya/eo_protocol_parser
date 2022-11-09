const DUMB_CONVERSIONS = [
    ['n_p_c', 'npc'],
    ['b_a_h_s_w', 'bahsw'],
    ['b_a_h_w_s', 'bahws'],
    ['b000_a0_h_s_w', 'b000a0hsw'],
];

function pascalToSnake (string) {
    const result = string.replace(/([A-Z])/g, '_$1').toLowerCase();

    for (const [from, to] of DUMB_CONVERSIONS) {
        if (result.includes(from)) {
            return result.replace(from, to).substr(1);
        }
    }

    return result.substr(1);
}

module.exports = pascalToSnake;

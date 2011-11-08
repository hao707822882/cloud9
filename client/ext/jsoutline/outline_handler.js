define(function(require, exports, module) {

var parser = require("treehugger/js/parse");
require("treehugger/traverse");
var baseLanguageHandler = require('ext/language/base_handler');

var outlineHandler = module.exports = Object.create(baseLanguageHandler);

outlineHandler.handlesLanguage = function(language) {
    return language === 'javascript';
};
    
outlineHandler.parse = function(code) {
    return parser.parse(code);
};

outlineHandler.outline = function(ast) {
    return extractOutline(ast);
};
    
function fargsToString(fargs) {
    var str = '(';
    for (var i = 0; i < fargs.length; i++) {
        str += fargs[i].value + ', ';
    }
    if(fargs.length > 0)
        str = str.substring(0, str.length - 2);
    str += ')';
    return str;
}

function expressionToName(node) {
    var name;
    node.rewrite(
        'Var(x)', function(b) { name = b.x.value; },
        'PropAccess(e, x)', function(b) { name = b.x.value; }
    );
    return name;
}

// This is where the fun stuff happens
function extractOutline(node) {
    var outline = [];
    node.traverseTopDown(
        // e.x = function(...) { ... }  -> name is x
        'Assign(e, Function(name, fargs, body))', function(b) {
            var name = expressionToName(b.e);
            if(!name) return false;
            outline.push({
                type: 'function',
                name: name + fargsToString(b.fargs),
                pos: this[1].getPos(),
                items: extractOutline(b.body)
            });
            return this;
        },
        'VarDeclInit(x, Function(name, fargs, body))', function(b) {
            outline.push({
                type: 'function',
                name: b.x.value + fargsToString(b.fargs),
                pos: this[1].getPos(),
                items: extractOutline(b.body)
            });
            return this;
        },
        // x : function(...) { ... } -> name is x
        'PropertyInit(x, Function(name, fargs, body))', function(b) {
            outline.push({
                type: 'function',
                name: b.x.value + fargsToString(b.fargs),
                pos: this[1].getPos(),
                items: extractOutline(b.body)
            });
            return this;
        },
        // e.on("listen", function(...) { ... }) -> name is on[listen]
        'Call(e, [String(s), Function(name, fargs, body)])', function(b) {
            var name = expressionToName(b.e);
            if(!name) return false;
            outline.push({
                type: 'function',
                name: name + '[' + b.s.value + ']' + fargsToString(b.fargs),
                pos: this.getPos(),
                items: extractOutline(b.body)
            });
            return this;
        },
        // intelligently name callback functions for method calls
        // setTimeout(function() { ... }, 200) -> name is setTimeout [callback]
        'Call(e, args)', function(b) {
            var name = expressionToName(b.e);
            if(!name) return false;
            var foundFunction = false;
            b.args.each(
                'Function(name, fargs, body)', function(b) {
                    if(b.name.value) return;
                    outline.push({
                        type: 'function',
                        name: name + '[callback]' + fargsToString(b.fargs),
                        pos: this.getPos(),
                        items: extractOutline(b.body)
                    });
                    foundFunction = true;
                }
            );
            return foundFunction ? this : false;
        },
        'Function(name, fargs, body)', function(b) {
            if(!b.name.value) return false;
            outline.push({
                type: 'function',
                name: b.name.value + fargsToString(b.fargs),
                pos: this.getPos(),
                items: extractOutline(b.body)
            });
            return this;
        }
    );
    return outline;
};

});
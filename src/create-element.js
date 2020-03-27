import options from './options';

/**
 * Create an virtual node (used for JSX)
 * @param {import('./internal').VNode["type"]} type The node name or Component
 * constructor for this virtual node
 * @param {object | null | undefined} [props] The properties of the virtual node
 * @param {Array<import('.').ComponentChildren>} [children] The children of the virtual node
 * @returns {import('./internal').VNode}
 */
/**
 * 创建元素
 * @param type {null |string| ComponentType} type 元素类型
 * 如果是文本数字等简单元素,则为null,
 * 如果是html标签的节点,则是html标签字符串,如`div`
 * 如果是函数型的节点,则是这个函数,如`App`判断是函数节点或者html标签主要依据是是否首字母大写,如果是大写,他就是函数型节点,如果是小写,他就是普通的html节点,这就是为什么函数组件首字母要求大写的原因
 *
 * @param props {string | Attributes} 元素属性
 * @param children {string | VNode} 元素子节点
 * @returns {VNode}
 */
export function createElement(type, props, children) {
	let normalizedProps = {},
		i;
	//选择性拷贝props
	for (i in props) {
		if (i !== 'key' && i !== 'ref') normalizedProps[i] = props[i];
	}
	//对参数处理，如果有多个children是数组，单个不是
	if (arguments.length > 3) {
		children = [children];
		// https://github.com/preactjs/preact/issues/1916
		for (i = 3; i < arguments.length; i++) {
			children.push(arguments[i]);
		}
	}
	//赋值给props.children
	if (children != null) {
		normalizedProps.children = children;
	}

	// If a Component VNode, check for and apply defaultProps
	// Note: type may be undefined in development, must never error here.
	//对defaultProps做处理，合并到props上
	if (typeof type == 'function' && type.defaultProps != null) {
		for (i in type.defaultProps) {
			if (normalizedProps[i] === undefined) {
				normalizedProps[i] = type.defaultProps[i];
			}
		}
	}
	//调用创建虚拟节点
	return createVNode(
		type,
		normalizedProps,
		props && props.key,
		props && props.ref
	);
}

/**
 * Create a VNode (used internally by Preact)
 * @param {import('./internal').VNode["type"]} type The node name or Component
 * Constructor for this virtual node
 * @param {object | string | number | null} props The properties of this virtual node.
 * If this virtual node represents a text node, this is the text of the node (string or number).
 * @param {string | number | null} key The key for this virtual node, used when
 * diffing it against its children
 * @param {import('./internal').VNode["ref"]} ref The ref property that will
 * receive a reference to its created child
 * @returns {import('./internal').VNode}
 */
//创建虚拟节点
//type为null时，props参数就是对应的children {type:null,props:123,..}这个是合法的
export function createVNode(type, props, key, ref) {
	// V8 seems to be better at detecting type shapes if the object is allocated from the same call site
	// Do not inline into createElement and coerceToVNode!
	const vnode = {
		type,
		props,
		key,
		ref,
		//子的虚拟节点
		_children: null,
		//父的虚拟节点
		_parent: null,
		//渲染深度
		_depth: 0,
		//该虚拟节点渲染的dom
		_dom: null,
		// _nextDom must be initialized to undefined b/c it will eventually
		// be set to dom.nextSibling which can return `null` and it is important
		// to be able to distinguish between an uninitialized _nextDom and
		// a _nextDom that has been set to `null`
		//组件类型节点会保存最后一个子节点的dom
		_nextDom: undefined,
		//类或函数组件的实例化
		_component: null,
		//标识是vnode
		constructor: undefined
	};
	//钩子
	if (options.vnode) options.vnode(vnode);

	return vnode;
}

//创建ref，这个ref不同react，创建时没有current
export function createRef() {
	return {};
}
//片段
export function Fragment(props) {
	return props.children;
}

/**
 * Check if a the argument is a valid Preact VNode.
 * @param {*} vnode
 * @returns {vnode is import('./internal').VNode}
 */
//判断是否是preact虚拟节点，createElement创建后constructor为undefined
export const isValidElement = vnode =>
	vnode != null && vnode.constructor === undefined;

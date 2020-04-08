import options from './options';

/**
 * Create an virtual node (used for JSX)
 * @param {import('./internal').VNode["type"]} type The node name or Component
 * constructor for this virtual node
 * @param {object | null | undefined} [props] The properties of the virtual node
 * @param {Array<import('.').ComponentChildren>} [children] The children of the virtual node
 * @returns {import('./internal').VNode}
 *
 * 创建虚拟节点（JSX转换为JS时使用）
 * 如果是文本数字等简单节点，type则为null,
 * 如果是html标签的节点，type则是html标签名称，如div
 * 如果是函数型的节点，则是这个函数，如App
 * 判断是函数或者html标签节点主要依据是首字母是否大写。如果是大写，他就是函数型节点；如果是小写，他就是普通的html节点（this除外）
 * 这就是为什么函数组件要求首字母大写的原因
 */
export function createElement(type, props, children) {
	let normalizedProps = {},
		i;
	//拷贝props到normalizedProps，会排除key与ref属性
	for (i in props) {
		if (i !== 'key' && i !== 'ref') normalizedProps[i] = props[i];
	}
	//处理children。如果有多个参数children是数组，单个不是
	if (arguments.length > 3) {
		children = [children];
		// https://github.com/preactjs/preact/issues/1916
		for (i = 3; i < arguments.length; i++) {
			children.push(arguments[i]);
		}
	}
	//赋值给新props
	if (children != null) {
		normalizedProps.children = children;
	}

	// If a Component VNode, check for and apply defaultProps
	// Note: type may be undefined in development, must never error here.
	//对defaultProps做处理，合并到新props上
	if (typeof type == 'function' && type.defaultProps != null) {
		for (i in type.defaultProps) {
			if (normalizedProps[i] === undefined) {
				normalizedProps[i] = type.defaultProps[i];
			}
		}
	}
	//创建虚拟节点
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
//创建虚拟节点（Preact内部使用）
//type为null时，props参数就是对应的children
//例如{type:null,props:123,..}这个是合法的
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
		//标识是虚拟节点
		constructor: undefined
	};
	//执行创建虚拟节点钩子
	if (options.vnode) options.vnode(vnode);

	return vnode;
}

//创建ref。这个ref不同于react，没有current
export function createRef() {
	return {};
}
//片段组件
export function Fragment(props) {
	return props.children;
}

/**
 * Check if a the argument is a valid Preact VNode.
 * @param {*} vnode
 * @returns {vnode is import('./internal').VNode}
 */
//判断是否是虚拟节点
//createElement创建后constructor为undefined
export const isValidElement = vnode =>
	vnode != null && vnode.constructor === undefined;

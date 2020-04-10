import { options } from 'preact';

/** @type {number} */
//当前hook对应的索引
let currentIndex;

/** @type {import('./internal').Component} */
//当前渲染的组件
let currentComponent;

/** @type {Array<import('./internal').Component>} */
//保存待调用effect函数和清理effect函数的组件
let afterPaintEffects = [];

//钩子，在执行每个组件的render方法之前调用
let oldBeforeRender = options._render;
//钩子，在比较完每个虚拟节点后调用
let oldAfterDiff = options.diffed;
//钩子，在渲染完所有组件后调用
let oldCommit = options._commit;
//钩子，在卸载组件前调用
let oldBeforeUnmount = options.unmount;
//timeout时间间隔
const RAF_TIMEOUT = 100;
//上次延迟执行器钩子
let prevRaf;

//在每个组件render执行前
options._render = vnode => {
	if (oldBeforeRender) oldBeforeRender(vnode);
	//保存当前组件并设置index为0
	currentComponent = vnode._component;
	currentIndex = 0;

	if (currentComponent.__hooks) {
		//先执行清理effect函数
		currentComponent.__hooks._pendingEffects.forEach(invokeCleanup);
		//然后执行effect函数
		currentComponent.__hooks._pendingEffects.forEach(invokeEffect);
		//将队列设为空
		currentComponent.__hooks._pendingEffects = [];
	}
};

//在比较完每个虚拟节点后
options.diffed = vnode => {
	if (oldAfterDiff) oldAfterDiff(vnode);
	//获得当前渲染组件
	const c = vnode._component;
	if (!c) return;

	const hooks = c.__hooks;
	if (hooks) {
		//如果当前组件使用了useEffect
		if (hooks._pendingEffects.length) {
			//保存在队列里，然后用延迟执行器执行
			afterPaint(afterPaintEffects.push(c));
		}
	}
};
//在渲染完所有组件后
options._commit = (vnode, commitQueue) => {
	commitQueue.some(component => {
		try {
			//先执行清理layoutEffect函数
			component._renderCallbacks.forEach(invokeCleanup);
			//然后执行layoutEffect函数，如果有返回结果继续留在队列中
			component._renderCallbacks = component._renderCallbacks.filter(cb =>
				cb._value ? invokeEffect(cb) : true
			);
		} catch (e) {
			//设置队列为空
			commitQueue.some(c => {
				if (c._renderCallbacks) c._renderCallbacks = [];
			});
			commitQueue = [];
			//触发异常
			options._catchError(e, component._vnode);
		}
	});

	if (oldCommit) oldCommit(vnode, commitQueue);
};
//在卸载组件时
options.unmount = vnode => {
	if (oldBeforeUnmount) oldBeforeUnmount(vnode);
	//获取当前卸载的组件
	const c = vnode._component;
	if (!c) return;

	const hooks = c.__hooks;
	if (hooks) {
		try {
			//执行清理effect函数
			hooks._list.forEach(hook => hook._cleanup && hook._cleanup());
		} catch (e) {
			//如果有异常触发异常
			options._catchError(e, c._vnode);
		}
	}
};

/**
 * Get a hook's state from the currentComponent
 * @param {number} index The index of the hook to get
 * @returns {import('./internal').HookState}
 */
//从正在渲染组件中获取hook数据
function getHookState(index) {
	//hook钩子
	if (options._hook) options._hook(currentComponent);
	// Largely inspired by:
	// * https://github.com/michael-klein/funcy.js/blob/f6be73468e6ec46b0ff5aa3cc4c9baf72a29025a/src/hooks/core_hooks.mjs
	// * https://github.com/michael-klein/funcy.js/blob/650beaa58c43c33a74820a3c98b3c7079cf2e333/src/renderer.mjs
	// Other implementations to look at:
	// * https://codesandbox.io/s/mnox05qp8
	//存在直接读取，不存在则创建初始hooks数据
	const hooks =
		currentComponent.__hooks ||
		(currentComponent.__hooks = { _list: [], _pendingEffects: [] });
	//如果没有对应的hook数据则新增
	if (index >= hooks._list.length) {
		hooks._list.push({});
	}
	return hooks._list[index];
}

/**
 * @param {import('./index').StateUpdater<any>} initialState
 */
//使用状态
export function useState(initialState) {
	//直接调用useReducer，等同于useReducer(state=>state, initialState)
	return useReducer(invokeOrReturn, initialState);
}

/**
 * @param {import('./index').Reducer<any, any>} reducer
 * @param {import('./index').StateUpdater<any>} initialState
 * @param {(initialState: any) => void} [init]
 * @returns {[ any, (state: any) => void ]}
 */
//使用reducer
export function useReducer(reducer, initialState, init) {
	/** @type {import('./internal').ReducerHookState} */
	const hookState = getHookState(currentIndex++);
	//如果是首次渲染
	if (!hookState._component) {
		hookState._component = currentComponent;

		hookState._value = [
			//处理初始状态
			!init ? invokeOrReturn(undefined, initialState) : init(initialState),
			//状态更新函数
			action => {
				//调用reducer获得新的状态
				const nextValue = reducer(hookState._value[0], action);
				//如果与当前状态不相同
				if (hookState._value[0] !== nextValue) {
					//更新新的状态
					hookState._value[0] = nextValue;
					//触发渲染组件
					hookState._component.setState({});
				}
			}
		];
	}

	return hookState._value;
}

/**
 * @param {import('./internal').Effect} callback
 * @param {any[]} args
 */
//使用effect
export function useEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++);
	//如果args与上次不相同
	if (argsChanged(state._args, args)) {
		state._value = callback;
		state._args = args;
		//推进队列里，稍后会后执行
		currentComponent.__hooks._pendingEffects.push(state);
	}
}

/**
 * @param {import('./internal').Effect} callback
 * @param {any[]} args
 */
//使用layoutEffect
export function useLayoutEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++);
	//如果args与上次不相同
	if (argsChanged(state._args, args)) {
		state._value = callback;
		state._args = args;
		//推进队列里，等所有组件渲染完成后执行
		currentComponent._renderCallbacks.push(state);
	}
}

//使用ref
export function useRef(initialValue) {
	//只有在组件首次渲染时执行此回调，返回新的带有current的对象，其它都是返回缓存中的
	return useMemo(() => ({ current: initialValue }), []);
}

/**
 * @param {object} ref
 * @param {() => object} createHandle
 * @param {any[]} args
 */
//使用imperativeHandle
export function useImperativeHandle(ref, createHandle, args) {
	useLayoutEffect(
		() => {
			//如果ref是函数，把执行结果传给函数，否则赋值给current属性
			if (typeof ref == 'function') ref(createHandle());
			else if (ref) ref.current = createHandle();
		},
		//处理依赖
		args == null ? args : args.concat(ref)
	);
}

/**
 * @param {() => any} factory
 * @param {any[]} args
 */
//使用memo，用来缓存复杂的计算值
export function useMemo(factory, args) {
	/** @type {import('./internal').MemoHookState} */
	const state = getHookState(currentIndex++);
	//当args与老的不相同时返回factory执行的结果
	if (argsChanged(state._args, args)) {
		state._args = args;
		state._factory = factory;
		return (state._value = factory());
	}
	//直接使用缓存值
	return state._value;
}

/**
 * @param {() => void} callback
 * @param {any[]} args
 */
//使用callback，用来缓存一个函数
export function useCallback(callback, args) {
	//当args与旧的不相同时返回新的函数，不然返回缓存中的函数
	return useMemo(() => callback, args);
}

/**
 * @param {import('./internal').PreactContext} context
 */
//使用context，用来使用context
export function useContext(context) {
	//通过id获得Provider组件的实例
	const provider = currentComponent.context[context._id];
	//如果祖先组件没有Provider组件，则直接使用_defaultValue
	if (!provider) return context._defaultValue;
	const state = getHookState(currentIndex++);
	// This is probably not safe to convert to "!"
	//首次渲染时订阅更新，当Provider组件value更新时渲染当前组件
	if (state._value == null) {
		state._value = true;
		provider.sub(currentComponent);
	}
	//返回Provider组件的值
	return provider.props.value;
}

/**
 * Display a custom label for a custom hook for the devtools panel
 * @type {<T>(value: T, cb?: (value: T) => string | number) => void}
 */
//使用DebugValue，在开发者工具中，自定义Hook会显示对应的值
export function useDebugValue(value, formatter) {
	//如果存在useDebugValue钩子
	if (options.useDebugValue) {
		//设置formatter会格式化value，不然直接是value
		options.useDebugValue(formatter ? formatter(value) : value);
	}
}

//使用ErrorBoundary，当前或者子孙组件渲染错误时会执行cb
export function useErrorBoundary(cb) {
	const state = getHookState(currentIndex++);
	const errState = useState();
	state._value = cb;
	//如果当前组件没有设置componentDidCatch生命周期
	if (!currentComponent.componentDidCatch) {
		currentComponent.componentDidCatch = err => {
			//执行cb
			if (state._value) state._value(err);
			//更新错误状态
			errState[1](err);
		};
	}
	//返回错误状态以及清除错误状态的函数
	return [
		errState[0],
		() => {
			errState[1](undefined);
		}
	];
}

/**
 * After paint effects consumer.
 */
//在延迟中执行effect函数和清理effect函数
function flushAfterPaintEffects() {
	//遍历队列
	afterPaintEffects.some(component => {
		//如果组件没有卸载
		if (component._parentDom) {
			try {
				//执行effect函数和清理effect函数 并清空队列
				component.__hooks._pendingEffects.forEach(invokeCleanup);
				component.__hooks._pendingEffects.forEach(invokeEffect);
				component.__hooks._pendingEffects = [];
			} catch (e) {
				//清空队列并触发异常
				component.__hooks._pendingEffects = [];
				options._catchError(e, component._vnode);
				return true;
			}
		}
	});
	afterPaintEffects = [];
}

/**
 * Schedule a callback to be invoked after the browser has a chance to paint a new frame.
 * Do this by combining requestAnimationFrame (rAF) + setTimeout to invoke a callback after
 * the next browser frame.
 *
 * Also, schedule a timeout in parallel to the the rAF to ensure the callback is invoked
 * even if RAF doesn't fire (for example if the browser tab is not visible)
 *
 * @param {() => void} callback
 */
//延迟执行器
function afterNextFrame(callback) {
	const done = () => {
		//清理定时器
		//下面使用了两个异步执行，不会重复执行的原因是第一个执行到这儿会清空异步任务
		clearTimeout(timeout);
		cancelAnimationFrame(raf);
		setTimeout(callback);
	};
	//使用setTimeout
	const timeout = setTimeout(done, RAF_TIMEOUT);

	let raf;
	//使用requestAnimationFrame
	if (typeof window != 'undefined') {
		raf = requestAnimationFrame(done);
	}
}

// Note: if someone used options.debounceRendering = requestAnimationFrame,
// then effects will ALWAYS run on the NEXT frame instead of the current one, incurring a ~16ms delay.
// Perhaps this is not such a big deal.
/**
 * Schedule afterPaintEffects flush after the browser paints
 * @param {number} newQueueLength
 */
//延迟执行effect函数和清理effect函数
function afterPaint(newQueueLength) {
	//如果队列长度为1或者重新设置过requestAnimationFrame钩子
	if (newQueueLength === 1 || prevRaf !== options.requestAnimationFrame) {
		prevRaf = options.requestAnimationFrame;
		//用延迟执行器执行
		(prevRaf || afterNextFrame)(flushAfterPaintEffects);
	}
}

/**
 * @param {import('./internal').EffectHookState} hook
 */
//执行清理effect函数
function invokeCleanup(hook) {
	if (hook._cleanup) hook._cleanup();
}

/**
 * Invoke a Hook's effect
 * @param {import('./internal').EffectHookState} hook
 */
//调用effect函数
function invokeEffect(hook) {
	//执行函数
	const result = hook._value();
	//如果执行结果是函数，则保存在_cleanup
	if (typeof result == 'function') hook._cleanup = result;
}

/**
 * @param {any[]} oldArgs
 * @param {any[]} newArgs
 */
//判断两个数组的元素是否相同
function argsChanged(oldArgs, newArgs) {
	return !oldArgs || newArgs.some((arg, index) => arg !== oldArgs[index]);
}

//如果f是函数返回此函数执行结果，不然返回f
function invokeOrReturn(arg, f) {
	return typeof f == 'function' ? f(arg) : f;
}

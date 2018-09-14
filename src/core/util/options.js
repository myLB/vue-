/* @flow */

import config from '../config'
import { warn } from './debug'
import { nativeWatch } from './env'
import { set } from '../observer/index'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
/*结论: 拿不到 vm 参数，那么处理的就是子组件的选项,因为子组件是不需要实例化的,是通过Vue.extend创造出来的*/
const strats = config.optionMergeStrategies
/*  初始化strats对象
  strats = {
    el: function (parent, child, vm, key) {
      if (!vm) {
        warn(
          `option "${key}" can only be used during instance ` +
          'creation with the `new` keyword.'
        )
      }
      return child === undefined ? parent : child
    },
    propsData: function (parent, child, vm, key) {
      if (!vm) {
        warn(
          `option "${key}" can only be used during instance ` +
          'creation with the `new` keyword.'
        )
      }
      return child === undefined ? parent : child
    },
    data: function (parentVal, childVal, vm) {
      //没有vue实例说明处理的是子组件选项
      if (!vm) {
        //存在并且不是function类型并且不是生产环境报警告，提示option的data属性要是工厂模式的函数
        if (childVal && typeof childVal !== 'function') {
          process.env.NODE_ENV !== 'production' && warn(
            'The "data" option should be a function ' +
            'that returns a per-instance value in component ' +
            'definitions.',
            vm
          )
          return parentVal
        }
        return mergeDataOrFn(parentVal, childVal)
      }
      return mergeDataOrFn(parentVal, childVal, vm)
    },
    beforeCreate,
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    destroyed,
    activated,
    deactivated,
    errorCaptured,
    activated,
    activated,
    components,
    directive,
    filter,
    watch,
    props,
    methods,
    inject,
    computed,
    provide,
  }
*/
/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  /*提示你 el 选项或者 propsData 选项只能在使用 new 操作符创建实例的时候可用*/
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal
  const keys = Object.keys(from)
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )
      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }
  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}

LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
/*合并parentVal和childVal对象为一个新对象,并对childVal参数检测是否为对象，否则报错*/
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  //参数childVal存在并且不是生产环境，检测childVal是否为对象
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  //不存在parentVal参数，直接返回childVal
  if (!parentVal) return childVal
  const ret = Object.create(null)
  //将parentVal对象合并到一个原型为空的空对象中
  extend(ret, parentVal)
  //存在childVal参数，那就将childVal对象合并进ret对象
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

/**
 * Validate component names
 */
/*验证组件名称,并给予相应冲突的警告*/
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key) //解析组件名，防止出现不合理或与原html标签冲突
  }
}

/*与原html标签名冲突或不规范名称给予警告提示*/
export function validateComponentName (name: string) {
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'can only contain alphanumeric characters and the hyphen, ' +
      'and must start with a letter.'
    )
  }
  /*不与slot,component字段名冲突*/  /*不与html标签和svg标签名冲突*/
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
/*将props格式化成标准的props格式*/
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props //获取参数中的props
  if (!props) return
  const res = {}
  let i, val, name
  //props是数组转换成object格式
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)//把-改成驼峰写法
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        //props使用数组语法时，数组各项必须是字符串
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    //props是对象类型
    for (const key in props) {
      val = props[key]
      name = camelize(key) //把-改成驼峰写法
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
    /*格式化成标准的props格式*/
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
/*将inject格式化成标准的inject格式*/
/*
   测试结果provide可以有两种格式
    1、值是直接赋值的
      provide: {
        val: 12312
      }
    2、值是与父组件耦合的
      provide () {
       return {
          getVal: this.getVal,
          val: this.val,
          ll: this.ll
       }
     }
*/
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject //缓存参数中的inject属性
  if (!inject) return
  const normalized = options.inject = {} //清空参数中的inject属性
  //inject属性为数组类型
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
    /*将inject转换成标准的格式 val: {
      from: 'val'  //匹配父组件中的provide的key名
    }*/
  } else if (isPlainObject(inject)) {
    //inject为对象格式，遍历对象
    for (const key in inject) {
      const val = inject[key] //获取key值
      //判断key值是否为对象,是对象则将标准格式与值合并，否则转换成标准格式
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
/*将Directives格式成标准的Directives格式*/
function normalizeDirectives (options: Object) {
  const dirs = options.directives //缓存options.directives的值
  if (dirs) {
    //遍历对象
    for (const key in dirs) {
      const def = dirs[key] //获取options.directives对象的key值
      //值的类型为function类型
      if (typeof def === 'function') {
        //重新赋值key值为其添加属性值都为def方法的bind、update属性
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

//验证值是否为对象,不是报警告并提示哪里错误
function assertObjectType (name: string, value: any, vm: ?Component) {
  //不是对象报警告
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions (
  parent: Object, //构造函数自带的options
  child: Object, //传入的参数options
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child)//检验组件名和标签并给予相应冲突的警告
  }

  /*
    允许合并另一个实例构造函数的options
    1、Vue.extend创造出来的子类也是拥有这个属性的
    2、Vue构造函数本身拥有这个属性
  */
  if (typeof child === 'function') {
    child = child.options
  }

  normalizeProps(child, vm) //规范化props
  normalizeInject(child, vm) //规范化Inject
  normalizeDirectives(child) //规范化Directives
  const extendsFrom = child.extends //缓存extends属性为extendsFrom
  if (extendsFrom) {
    //重新赋值parent为一个原parent和extendsFrom合并的全新对象
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  //存在mixins属性并循环赋值parent为一个原parent和mixins[i]合并的全新对象
  if (child.mixins) {
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  const options = {}
  let key
  /*
    遍历parent对象,判断key名是否存在于初始化的strats对象中
      1、存在: 返回strats[key]的值
      2、不存在: 返回一个默认的初始函数
    执行这个返回的函数 && 将这个函数返回的值赋值给options[key]
  */
  for (key in parent) {
    mergeField(key)
  }
  /*
    遍历child对象,判断key名是否已经存在于parent对象中
      1、存在: 不做任何事情
      2、不存在: 判断key名是否存在于初始化的strats对象中
            1、存在: 返回strats[key]的值
            2、不存在: 返回一个默认的初始函数
        执行这个返回的函数 && 将这个函数返回的值赋值给options[key]
  */
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Default strategy.
 */
/*1、第二个参数没传或为undefined,返回第一个参数
2、第二个参数存在，返回第二个参数*/
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}

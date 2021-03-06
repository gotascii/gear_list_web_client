import { Injectable, Inject } from '@angular/core';
import { Observable, Subject, BehaviorSubject, ReplaySubject } from 'rxjs/Rx';

@Injectable()
export class ItemService {
  /*
   * <any> makes me sad, no doubt. The JSData typings indicate that findAll()
   * returns an array of objects that implement <T & DSInstanceShorthands<T>>.
   * However, in the JSes/at runtime this is not actually the case.
   *
   * Alterative 1: <Item> could be used. However, the object returned from
   * findAll() is based on a JSData-owned prototype and will not actually be an
   * Item complete with the methods defined in item.ts. Methods *can* be added
   * to the resource definition under the `methods` key, but mixing this with
   * <Item> can result in drift between the runtime interface and the Item
   * interface.
   *
   * Alternative 2: Item objects could be hydrated based on the JSData objects
   * returned from findAll(). When data model objects have complex relationship
   * graphs the logic for *how* to hydrate the graph will become complex.
   *
   * Ultimately, I thought it better to lose type safety here and constrain
   * data object interface specification to one place in the code base.
   */

  private _items$: ReplaySubject<any>;
  private onCreate$: Subject<any>;
  private onDestroy$: Subject<any>;
  private onRefresh$: Subject<any>;

  constructor(@Inject('ITEM_RESOURCE') private resource:JSData.DSResourceDefinition<any>) {
    this.onCreate$ = new Subject<any>();
    this.onDestroy$ = new Subject<any>();
    this.onRefresh$ = new Subject<any>();

    let created$ = this.onCreate$.
      flatMap((item) => {
        return this.resource.create(item);
      }).share();

    let destroyed$ = this.onDestroy$.
      flatMap((item) => {
        return this.resource.destroy(item);
      }).share();

    let raw$ = Observable.merge(created$, destroyed$, this.onRefresh$).
      flatMap((x, i) => {
        return this.resource.findAll({}, {bypassCache: true});
      });

    let sorted$ = raw$.
      map((items) => {
        let sorted = items.sort((a: any, b: any) => {
          let fa = a.function.name.toUpperCase();
          let fb = b.function.name.toUpperCase();

          let an = a.name.toUpperCase();
          let bn = b.name.toUpperCase();

          if (fa < fb) return -1;
          if (fa > fb) return 1;
          if (an < bn) return -1;
          if (an > bn) return 1;

          return 0;
        });
        return sorted;
      });

    this._items$ = new ReplaySubject(1);
    sorted$.subscribe(this._items$);
  }

  // The ReplaySubject must persist across component lifecycle in order to
  // cached the sorted set. However, findAll needs to be called once on each
  // top-level component init and the cached value in ReplaySubject needs to be
  // refreshed.
  items$() {
    this.onRefresh$.next(true);
    return this._items$;
  }

  filtered() {
    // findAll is cached by params.
    // if useFilter is true, filtering of in-memory items is done.
    // if useFilter is false (default),
    //   if query is cached, cached results are returned.
    //   if query is not cached, shit goes down.
    // this.resource.findAll(
    //   params:{
    //     orderBy:[['name', 'DESC']],
    //     offset: 10,
    //     limit: 10
    //   },
    //   options:{bypassCache, cacheResponse, useFilter}
    // );

    let onFilter$ = new Subject<any>();

    let filtered$ = onFilter$.flatMap((params) => {
      return this.resource.findAll(params, { useFilter: true });
    });

    let raw$ = onFilter$.flatMap((params) => {
      return this.resource.findAll(params, { bypassCache: true });
    });

    let stream$ = Observable.merge(filtered$, raw$);
    let omg$ = new ReplaySubject(1);
    stream$.subscribe(omg$);
    return {stream$: omg$, onFilter$: onFilter$};
  }

  create(item: {}) {
    this.onCreate$.next(item);
  }

  destroy(item: {}) {
    this.onDestroy$.next(item);
  }
}


import { Utils } from '../utils';
import { MetadataStorage } from '../metadata';
import { EntityProperty, IEntity } from '../decorators';
import { ChangeSet } from './ChangeSet';
import { Collection, EntityIdentifier, EntityValidator, ReferenceType } from '../entity';

export class ChangeSetComputer {

  private readonly metadata = MetadataStorage.getMetadata();

  constructor(private readonly validator: EntityValidator,
              private readonly originalEntityData: Record<string, IEntity>,
              private readonly identifierMap: Record<string, EntityIdentifier>) { }

  computeChangeSet(entity: IEntity): ChangeSet | null {
    const changeSet = { entity } as ChangeSet;
    const meta = this.metadata[entity.constructor.name];

    changeSet.name = meta.name;
    changeSet.collection = meta.collection;
    changeSet.payload = this.computePayload(entity);

    this.validator.validate<typeof entity>(changeSet.entity, changeSet.payload, meta);

    for (const prop of Object.values(meta.properties)) {
      this.processReference(changeSet, prop);
    }

    if (entity.id && Object.keys(changeSet.payload).length === 0) {
      return null;
    }

    return changeSet;
  }

  private computePayload(entity: IEntity): Record<string, any> {
    if (entity.id && this.originalEntityData[entity.uuid]) {
      return Utils.diffEntities(this.originalEntityData[entity.uuid], entity);
    } else {
      return Utils.prepareEntity(entity);
    }
  }

  private processReference(changeSet: ChangeSet, prop: EntityProperty): void {
    if (prop.reference === ReferenceType.MANY_TO_MANY && prop.owner) {
      this.processManyToMany(changeSet, prop, changeSet.entity[prop.name]);
    } else if (prop.reference === ReferenceType.MANY_TO_ONE && changeSet.entity[prop.name]) {
      this.processManyToOne(prop, changeSet);
    }
  }

  private processManyToOne(prop: EntityProperty, changeSet: ChangeSet): void {
    const pk = this.metadata[prop.type].primaryKey;
    const entity = changeSet.entity[prop.name];

    if (!entity[pk]) {
      changeSet.payload[prop.name] = this.identifierMap[entity.uuid];
    }
  }

  private processManyToMany(changeSet: ChangeSet, prop: EntityProperty, collection: Collection<IEntity>): void {
    if (prop.owner && collection.isDirty()) {
      const pk = this.metadata[prop.type].primaryKey as keyof IEntity;
      changeSet.payload[prop.name] = collection.getItems().map(item => item[pk] || this.identifierMap[item.uuid]);
      collection.setDirty(false);
    }
  }

}
